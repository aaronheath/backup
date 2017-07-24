const fs = require('fs');
const aws = require('aws-sdk');
const progress = require('ascii-progress');
const Table = require('cli-table');

aws.config.update({region: 'ap-southeast-2'});

async function upload(vaultName, path, debug = false) {
    const buffer = fs.readFileSync(path);
    const glacier = new aws.Glacier({apiVersion: '2012-06-01'});
    const partSize = 1024 * 1024; // 1MB chunks;
    const startTime = new Date();
    const params = {vaultName, partSize: partSize.toString()};
    let numPartsLeft = Math.ceil(buffer.length / partSize);

    const chunkCount = Math.ceil(buffer.length / partSize);

    const sending = new progress({schema:   'Sending   [:bar.cyan] :percent', total: chunkCount});
    const completed = new progress({schema: 'Completed [:bar.blue] :percent', total: chunkCount});

    // Compute the complete SHA-256 tree hash so we can pass it
    // to completeMultipartUpload request at the end
    const treeHash = glacier.computeChecksums(buffer).treeHash;

    // Initiate the multipart upload
    console.log('Initiating upload to', vaultName);

    return new Promise((resolve, reject) => {
        glacier.initiateMultipartUpload(params, (mpErr, multipart) => {
            if(mpErr) {
                console.error('Error!', mpErr.stack);
                reject(err);
                return;
            }

            console.log('Upload ID', multipart.uploadId);

            // Grab each partSize chunk and upload it as a part
            for(let i = 0; i < buffer.length; i += partSize) {
                const end = Math.min(i + partSize, buffer.length);

                const partParams = {
                    vaultName,
                    uploadId: multipart.uploadId,
                    range: `bytes ${i}-${end - 1}/*`,
                    body: buffer.slice(i, end),
                };

                // Send a single part
                if(debug) {
                    console.log('Uploading part', i, '=', partParams.range);
                    console.log(`Starting part ${i/partSize}`);
                } else {
                    sending.tick();
                }

                glacier.uploadMultipartPart(partParams, function(multiErr, mData) {
                    if(multiErr) {
                        reject(multiErr);
                        return;
                    }

                    if(debug) {
                        console.log('Completed part', this.request.params.range);
                        console.log(`Completed part ${i/partSize}`);
                    } else {
                        completed.tick();
                    }

                    if(--numPartsLeft > 0) { // complete only when all parts uploaded
                        return;
                    }

                    const doneParams = {
                        vaultName,
                        uploadId: multipart.uploadId,
                        archiveSize: buffer.length.toString(),
                        checksum: treeHash, // the computed tree hash
                    };

                    console.log('Completing upload...');

                    glacier.completeMultipartUpload(doneParams, (err, data) => {
                        if(err) {
                            console.log('An error occurred while uploading the archive');
                            console.log(err);
                            reject(err);
                        } else {
                            const delta = (new Date() - startTime) / 1000;

                            console.log(`Upload duration: ${delta} seconds`);
                            console.log(`Archive ID:      ${data.archiveId}`);
                            console.log(`Checksum:        ${data.checksum}`);

                            resolve()
                        }
                    });
                });
            }
        });
    });
}

module.exports = {
    upload,
};