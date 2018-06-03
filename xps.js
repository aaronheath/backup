#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const dateFormat = require('date-fns/format');
const colors = require('colors');
const Table = require('cli-table');

const config = require('./.config.xps');
const glacier = require('./aws-glacier');

const mountphrase = config.mount_phrase;
const GPG_PASSPHRASE = config.gpg_pass_phrase;

const deltas = {start: new Date()};

/***********************************
 * CONFIG
 ***********************************/

const started = new Date();
const EXTERNAL_DRIVE_MOUNTPOINT = '/media/aaronheath/2CBF65160A60F336';
const USB_DIR_TO_MOUNT = `${EXTERNAL_DRIVE_MOUNTPOINT}/xps`;
const MOUNTPOINT = `${EXTERNAL_DRIVE_MOUNTPOINT}/xps`;
const TO = `${MOUNTPOINT}/backup`;
const HOME = '/home/aaronheath';
const HOME_TO = `${TO}/aaronheath`;
const SYSTEM_TO = `${TO}/system`;
const NOW = currentYMDHMS();
const PASSPHRASE_TEMP_FILE = '/tmp/passphrase.txt';

/**
 * Mount the encyrpted share on external drive
 */

function mountDrive() {
    msg('Evaluating whether to mount drive', 'blue');

    const mountReturn = execSync('mount').toString();

    if(mountReturn.includes(MOUNTPOINT)) {
        return msg(`${MOUNTPOINT} is already mounted!`, 'blue');
    }

    pipe([
        `printf "%s" "${mountphrase}"`,
        `ecryptfs-add-passphrase > "${PASSPHRASE_TEMP_FILE}"`,
    ]);

    const sig = pipe([
        `tail -1 "${PASSPHRASE_TEMP_FILE}"`,
        'awk \'{print $6}\'',
        'sed "s/\\[//g"',
        'sed "s/\\]//g"',
        'sed "s/ //g"',
    ]).toString();

    unlink(PASSPHRASE_TEMP_FILE);

    mount(mountphrase, toOneLine(sig, true), USB_DIR_TO_MOUNT, MOUNTPOINT);

    msg(`${MOUNTPOINT} has been mounted!`, 'blue');
}

/**
 * Unmount the encrypted share and the external drive
 */

function unmountDrive() {
    const mountReturn = execSync('mount').toString();

    if(!mountReturn.includes(MOUNTPOINT)) {
        return console.log(`Unable to unmount ${MOUNTPOINT} is not mounted!`.blue);
    }

    run(`sudo umount ${MOUNTPOINT}`);
    msg(`Unmounted encrypted share at ${MOUNTPOINT}`, 'blue');

    run(`sudo umount ${EXTERNAL_DRIVE_MOUNTPOINT}`);
    msg(`Unmounted external drive at ${EXTERNAL_DRIVE_MOUNTPOINT}`, 'blue');
}

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

function mount(passphrase, signature, pathToMount, pathToMountAt) {
    const cmd = `sudo mount -t ecryptfs -o key=passphrase:passphrase_passwd=${passphrase},no_sig_cache=yes,verbose=no,cryptfs_sig=${signature},ecryptfs_cipher=aes,ecryptfs_key_bytes=16,ecryptfs_passthrough=no,ecryptfs_enable_filename_crypto=yes,ecryptfs_fnek_sig=${signature} "${pathToMount}" "${pathToMountAt}"`;

    run(cmd);
    msg(`${pathToMount} has been mounted at ${pathToMountAt}!`, 'blue');
}

/**
 * Sync dirs from local to encrypted external
 */

function syncDirs() {
    // Create dir to copy to if it doesn't exist
    if(!fs.existsSync(TO)) {
        fs.mkdirSync(TO);

        msg(`Created directory at ${TO}`, 'blue');
    }

    // Code Repositories
    const CODE_DIR = `${HOME}/code`;

    const rsyncCode = `
sudo rsync -ah --stats --delete --max-size="10000k"
--exclude="node_modules"
--exclude="vendor"
--exclude=".vagrant"
"${CODE_DIR}" "${HOME_TO}"
`;

    run(toOneLine(rsyncCode), true);
    msg(`Rsync'd ${CODE_DIR} to ${HOME_TO}`, 'blue');

    // Documents
    basicRsync(`${HOME}/Documents`, HOME_TO);

    // Pictures
    basicRsync(`${HOME}/Pictures`, HOME_TO);

    // Videos
    basicRsync(`${HOME}/Videos`, HOME_TO);

    // Virtual Boxes
    basicRsync(`${HOME}/VirtualBox VMs`, HOME_TO);

    // My Config Files
    const rsyncMyConfigFiles = `
sudo rsync -ah --stats --delete
-f "- */"
-f "+ *"
${HOME} "${HOME_TO}/my-configs"
`;

    run(toOneLine(rsyncMyConfigFiles), true);
    msg(`Rsync'd ${HOME} to "${HOME_TO}/my-configs"`, 'blue');

    // System files and configs
    const ROOT = '/';

    const rsyncSystemFiles = `
sudo rsync -ah --stats --delete
--exclude="_cacache"
--include="/etc/***"
--include="/root/***"
--include="/boot/***"
--exclude="*"
${ROOT} ${SYSTEM_TO}
`;

    run(toOneLine(rsyncSystemFiles), true);
    msg(`Rsync'd ${ROOT} to ${SYSTEM_TO}`, 'blue');
}

function basicRsync(from, to) {
    run(`rsync -ah --stats --delete "${from}" "${to}"`, true);
    msg(`Rsync'd ${from} to ${to}`, 'blue');
}

/**
 * BUNDLE CODE REPOSITORY BACKUP & ENCRYPT
 */

function bundleAndEncrypt() {
    const TEMP_NAME = `/tmp/${NOW}-code-repository.tar.bz`;
    run(`tar cvfj "${TEMP_NAME}" "${HOME_TO}/code"`);
    run(`gpg --yes --batch --passphrase="${GPG_PASSPHRASE}" -c "${TEMP_NAME}"`);
    unlink(TEMP_NAME);

    msg('Bundle and encryption completed.', 'blue');
}

/**
 * SEND TO AWS GLACIER
 */

async function upload() {
    return await glacier.upload('CodeBackups', `/tmp/${NOW}-code-repository.tar.bz.gpg`).catch(() => {
        msg('Upload failed!', 'red');
    });
}

/**
 * Utils
 * TODO BREAKOUT
 */

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

/**
 * Init
 */

function currentDelta(splitStart) {
    const now = new Date();

    return {overall: (now - deltas.start) / 1000, split: (now - splitStart) / 1000, rawSplit: now};
}

async function main() {
    headingMsg(`XPS BACKUP
Started at: ${started}`);

    mountDrive();
    deltas.mountDrive = currentDelta(deltas.start);

    syncDirs();
    deltas.syncDirs = currentDelta(deltas.mountDrive.rawSplit);

    bundleAndEncrypt();
    deltas.bundleAndEncrypt = currentDelta(deltas.syncDirs.rawSplit);

    await upload();
    deltas.upload = currentDelta(deltas.bundleAndEncrypt.rawSplit);

    unmountDrive();
    deltas.unmountDrive = currentDelta(deltas.upload.rawSplit);

    const table = new Table({
        head: ['Task', 'Duration (sec)', 'Overall (sec)'],
    });

    table.push(
        ['Mount Drive', deltas.mountDrive.split, deltas.mountDrive.overall],
        ['Sync Dirs', deltas.syncDirs.split, deltas.syncDirs.overall],
        ['Bundle & Encrypt', deltas.bundleAndEncrypt.split, deltas.bundleAndEncrypt.overall],
        ['Upload to Glacier', deltas.upload.split, deltas.upload.overall],
        ['Unmount Drive', deltas.unmountDrive.split, deltas.unmountDrive.overall],
    );

    headingMsg('Backup Completed');
    console.log(table.toString());
    rowStars();
}

main().catch((err) => {
    rowStars('red');
    msg('Backup Failed', 'red');
    rowStars('red');
});
