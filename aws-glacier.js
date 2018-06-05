const fs = require('fs');
const crypto = require('crypto');
const aws = require('aws-sdk');
const progress = require('ascii-progress');
const bo = require('basic-oauth2');
const utils = require('./utils');
const config = require('./.config');

aws.config.update({region: 'ap-southeast-2'});

const glacier = new aws.Glacier({apiVersion: '2012-06-01'});

let _vaultName, _path, _debug, _buffer, _partSize, _numPartsLeft, _chunkCount, _startTime, _params, _sending, _completed, _treeHash, _notifyRemote;

async function upload(vaultName, path, notifyRemote = false, debug = false) {
    setup(vaultName, path, notifyRemote, debug);

    console.log('Initiating upload to', vaultName);

    return new Promise((resolve, reject) => {
        initMultipartUpload(resolve, reject);
    });
}

function setup(vaultName, path, notifyRemote, debug) {
    _vaultName = vaultName;
    _path = path;
    _notifyRemote = notifyRemote;
    _debug = debug;

    _buffer = fs.readFileSync(path);
    _partSize = 1024 * 1024; // 1MB chunks
    _numPartsLeft = Math.ceil(_buffer.length / _partSize);
    _chunkCount = Math.ceil(_buffer.length / _partSize);

    _startTime = new Date();

    _params = {vaultName: _vaultName, partSize: _partSize.toString()};

    // Bars
    _sending = new progress({schema:   'Sending   [:bar.cyan] :percent', total: _chunkCount});
    _completed = new progress({schema: 'Completed [:bar.blue] :percent', total: _chunkCount});

    // Compute the complete SHA-256 tree hash so we can pass it
    // to completeMultipartUpload request at the end
    _treeHash = glacier.computeChecksums(_buffer).treeHash;
}

function initMultipartUpload(resolve, reject) {
    glacier.initiateMultipartUpload(_params, (mpErr, multipart) => {
        if(mpErr) {
            console.error('Error!', mpErr.stack);
            reject(err);
            return;
        }

        console.log('Upload ID', multipart.uploadId);

        // Grab each partSize chunk and upload it as a part
        for(let i = 0; i < _buffer.length; i += _partSize) {
            const end = Math.min(i + _partSize, _buffer.length);

            const partParams = {
                vaultName: _vaultName,
                uploadId: multipart.uploadId,
                range: `bytes ${i}-${end - 1}/*`,
                body: _buffer.slice(i, end),
            };

            // Send a single part
            if(_debug) {
                console.log('Uploading part', i, '=', partParams.range);
                console.log(`Starting part ${i/_partSize}`);
            } else {
                _sending.tick();
            }

            uploadPart(partParams, resolve, reject, multipart);

        }
    });
}

function uploadPart(params, resolve, reject, multipart) {
    glacier.uploadMultipartPart(params, function(multiErr, mData) {
        if(multiErr) {
            console.log('Retry request');
            uploadPart(params, resolve, reject, multipart);
            return;
        }

        if(_debug) {
            console.log('Completed part', this.request.params.range);
            console.log(`Completed part ${i/_partSize}`);
        } else {
            _completed.tick();
        }

        if(--_numPartsLeft > 0) { // complete only when all parts uploaded
            return;
        }

        const doneParams = {
            vaultName: _vaultName,
            uploadId: multipart.uploadId,
            archiveSize: _buffer.length.toString(),
            checksum: _treeHash, // the computed tree hash
        };

        console.log('Completing upload...');

        glacier.completeMultipartUpload(doneParams, async (err, data) => {
            if(err) {
                console.log('An error occurred while uploading the archive');
                console.log(err);
                reject(err);
            } else {
                const delta = (new Date() - _startTime) / 1000;

                console.log(`Upload duration: ${delta} seconds`);
                console.log(`Archive ID:      ${data.archiveId}`);
                console.log(`Checksum:        ${data.checksum}`);

                if(_notifyRemote) {
                    await sendNotificationToRemote(data);
                }

                resolve({duration: delta, data});
            }
        });
    });
}

async function fileHash(filename, algorithm = 'sha256') {
    return new Promise((resolve, reject) => {
        let shasum = crypto.createHash(algorithm);

        try {
            let s = fs.ReadStream(filename);

            s.on('data', data => shasum.update(data));

            s.on('end', () => {
                const hash = shasum.digest('hex');

                return resolve(hash);
            });
        } catch (error) {
            return reject('Unable to generate checksum for uploaded file');
        }
    });
}

async function sendNotificationToRemote(data) {
    const pathArray = _path.split('/');
    const checksum = await fileHash(_path);

    try {
        const http = await bo.http();

        await http.post(config.glacier_archive, {
            archive_id: data.archiveId,
            filename: pathArray[pathArray.length - 1],
            vault: _vaultName,
            filesize: fs.statSync(_path).size,
            checksum,
        });

        console.log('Notification of AWS Glacier upload dispatched to remote server.');
    } catch(error) {
        utils.rowStars('red');
        utils.msg('Unable to dispatch notification of AWS Glacier upload to remote server.')
        console.error(error.response);
        utils.rowStars('red');
    }
}

module.exports = {
    upload,
};
