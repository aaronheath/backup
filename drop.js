#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const glacier = require('./aws-glacier');
const colors = require('colors');
const dateFormat = require('date-fns/format');
const utils = require('./utils');

const config = require('./.config.xps');
// const NOW = currentYMDHMS();
const GPG_PASSPHRASE = config.gpg_pass_phrase;

// function bundleAndEncrypt() {
//     const TEMP_NAME = `/tmp/${NOW}-drop.tar.bz`;
//     run(`tar cvfj "${TEMP_NAME}" "/home/aaronheath/code/backup/drop"`);
//     run(`gpg --yes --batch --passphrase="${GPG_PASSPHRASE}" -c "${TEMP_NAME}"`);
//     unlink(TEMP_NAME);
//
//     msg('Bundle and encryption completed.', 'blue');
// }
//
// async function upload() {
//     return await glacier.upload('CodeBackups', `/tmp/${NOW}-drop.tar.bz.gpg`, true).catch(() => {
//         msg('Upload failed!', 'red');
//     });
// }

// function run(cmd, showOutput = false) {
//     const options = {};
//
//     if(showOutput) {
//         options.stdio = 'inherit';
//     }
//
//     return execSync(cmd, options);
// }
//
// function unlink(path) {
//     fs.unlinkSync(path);
// }
//
// function msg(_msg, color) {
//     txt(_msg, color);
// }

// function txt(msg, color) {
//     console.log(colors[color](msg))
// }

// function currentYMDHMS() {
//     const now = new Date();
//
//     return dateFormat(now, 'YYYYMMDDHHmmss');
// }

// function rowStars(color = 'green') {
//     txt('*******************************************', color);
// }

async function main() {
    const vault = 'CodeBackups'; // TODO create vault for drops
    const dir = '/home/aaronheath/code/backup/drop';

    utils.bundleAndEncrypt(vault, dir, GPG_PASSPHRASE);

    await utils.upload(vault);
}

main().catch((err) => {
    utils.rowStars('red');
    utils.msg('Backup Failed', 'red');
    console.log('error', err);
    utils.rowStars('red');
});
