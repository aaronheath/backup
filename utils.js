const execSync = require('child_process').execSync;
const fs = require('fs');
const dateFormat = require('date-fns/format');
const colors = require('colors');
const glacier = require('./aws-glacier');

const NOW = currentYMDHMS();

function pipe(cmds) {
    const cmd = cmds.join(' | ');

    return run(cmd);
}

function run(cmd, showOutput = false) {
    const options = {};

    if(showOutput) {
        options.stdio = 'inherit';
    }

    return execSync(cmd, options);
}

function unlink(path) {
    fs.unlinkSync(path);
}

function toOneLine(string, noSpace = false) {
    return string.replace(/(\r\n|\n|\r)/gm, noSpace ? '' : ' ');
}

function currentYMDHMS() {
    const now = new Date();

    return dateFormat(now, 'YYYYMMDDHHmmss');
}

function basicRsync(from, to) {
    run(`rsync -ah --stats --delete "${from}" "${to}"`, true);
    msg(`Rsync'd ${from} to ${to}`, 'blue');
}

function bundleAndEncrypt(vault, dir, passphrase) {
    const TEMP_NAME = `/tmp/${NOW}-${vault}.tar.bz`;
    run(`tar cvfj "${TEMP_NAME}" "${dir}"`);
    run(`gpg --yes --batch --passphrase="${passphrase}" -c "${TEMP_NAME}"`);
    unlink(TEMP_NAME);

    msg('Bundle and encryption completed.', 'blue');
}

async function upload(vault) {
    return await glacier.upload(vault, `/tmp/${NOW}-${vault}.tar.bz.gpg`, true).catch(() => {
        msg('Upload failed!', 'red');
    });
}

function headingMsg(_msg) {
    rowStars();
    txt(_msg, 'green');
    rowStars();
}

function msg(_msg, color) {
    txt(_msg, color);
}

function rowStars(color = 'green') {
    txt('*******************************************', color);
}

function txt(msg, color) {
    console.log(colors[color](msg))
}

module.exports = {
    pipe,
    run,
    unlink,
    toOneLine,
    currentYMDHMS,
    basicRsync,
    bundleAndEncrypt,
    upload,
    headingMsg,
    msg,
    rowStars,
    txt,
};
