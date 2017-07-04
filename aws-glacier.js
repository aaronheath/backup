/**
 * Created by aaronheath on 3/07/17.
 */

const fs = require('fs');
const aws = require('aws-sdk');

aws.config.update({region: 'ap-southeast-2'});

function upload(path) {
    const buffer = fs.readFileSync(path);

    var glacier = new aws.Glacier({apiVersion: '2012-06-01'}),
        vaultName = 'CodeBackups',
        partSize = 1024 * 1024, // 1MB chunks,
        numPartsLeft = Math.ceil(buffer.length / partSize),
        startTime = new Date(),
        params = {vaultName: vaultName, partSize: partSize.toString()};

// Compute the complete SHA-256 tree hash so we can pass it
// to completeMultipartUpload request at the end
    var treeHash = glacier.computeChecksums(buffer).treeHash;

// Initiate the multipart upload
    console.log('Initiating upload to', vaultName);
    glacier.initiateMultipartUpload(params, function (mpErr, multipart) {
        if (mpErr) { console.log('Error!', mpErr.stack); return; }
        console.log("Got upload ID", multipart.uploadId);

        // Grab each partSize chunk and upload it as a part
        for (var i = 0; i < buffer.length; i += partSize) {
            var end = Math.min(i + partSize, buffer.length),
                partParams = {
                    vaultName: vaultName,
                    uploadId: multipart.uploadId,
                    range: 'bytes ' + i + '-' + (end-1) + '/*',
                    body: buffer.slice(i, end)
                };

            // Send a single part
            console.log('Uploading part', i, '=', partParams.range);
            glacier.uploadMultipartPart(partParams, function(multiErr, mData) {
                if (multiErr) return;
                console.log("Completed part", this.request.params.range);
                if (--numPartsLeft > 0) return; // complete only when all parts uploaded

                var doneParams = {
                    vaultName: vaultName,
                    uploadId: multipart.uploadId,
                    archiveSize: buffer.length.toString(),
                    checksum: treeHash // the computed tree hash
                };

                console.log("Completing upload...");
                glacier.completeMultipartUpload(doneParams, function(err, data) {
                    if (err) {
                        console.log("An error occurred while uploading the archive");
                        console.log(err);
                    } else {
                        var delta = (new Date() - startTime) / 1000;
                        console.log('Completed upload in', delta, 'seconds');
                        console.log('Archive ID:', data.archiveId);
                        console.log('Checksum:  ', data.checksum);
                    }
                });
            });
        }
    });
}

module.exports = {
    upload,
}