#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const dateFormat = require('date-fns/format');

const config = require('./.config.xps');
const glacier = require('./aws-glacier');

const mountphrase = config.mount_phrase;
const GPG_PASSPHRASE = config.gpg_pass_phrase;

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
    const mountReturn = execSync('mount').toString();

    if(mountReturn.includes(MOUNTPOINT)) {
        return console.log(`${MOUNTPOINT} is already mounted!`);
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
}

/**
 * Unmount the encyrpted share and the external drive
 */

function unmountDrive() {
    const mountReturn = execSync('mount').toString();

    if(!mountReturn.includes(MOUNTPOINT)) {
        return console.log(`Unable to unmount ${MOUNTPOINT} is not mounted!`);
    }

    run(`sudo umount ${MOUNTPOINT}`);
    console.log(`Unmounted encrypted share at ${MOUNTPOINT}`);

    run(`sudo umount ${EXTERNAL_DRIVE_MOUNTPOINT}`);
    console.log(`Unmounted external drive at ${EXTERNAL_DRIVE_MOUNTPOINT}`);
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

    console.log(`${pathToMount} has been mounted at ${pathToMountAt}!`);
}



/**
 * Sync dirs from local to encrypted external
 */

function syncDirs() {
    // Create dir to copy to if it doesn't exist
    if(!fs.existsSync(TO)) {
        fs.mkdirSync(TO);

        console.log(`Created directory at ${TO}`);
    }

    // Code Repositories
    const CODE_DIR = `${HOME}/Code`;

    const rsyncCode = `
rsync -avh --delete --max-size="10000k"
--exclude="node_modules"
--exclude="vendor"
--exclude=".vagrant"
"${CODE_DIR}" "${HOME_TO}"
`;

    run(toOneLine(rsyncCode), true);

    console.log(`Rsync'd ${CODE_DIR} to ${HOME_TO}`);

    // Documents
    basicRsync(`${HOME}/Documents`, HOME_TO);

    // Pictures
    basicRsync(`${HOME}/Pictures`, HOME_TO);

    // Videos
    basicRsync(`${HOME}/Videos`, HOME_TO);

    // Virtual Boxes
    basicRsync(`${HOME}/VirtualBox VMs`, HOME_TO);

    // System files and configs
    const ROOT = '/';

    const rsyncSystemFiles = `
sudo rsync -avh --delete
--exclude="_cacache"
--include="/etc/***"
--include="/root/***"
--include="/boot/***"
--exclude="*"
${ROOT} ${SYSTEM_TO}
`;

    run(toOneLine(rsyncSystemFiles), true);

    console.log(`Rsync'd ${ROOT} to ${SYSTEM_TO}`);
}

function basicRsync(from, to) {
    run(`rsync -avh --delete "${from}" "${to}"`, true);

    console.log(`Rsync'd ${from} to ${to}`);
}

/**
 * BUNDLE CODE REPOSITORY BACKUP & ENCRYPT
 */

function bundleAndEncrypt() {
    const TEMP_NAME = `/tmp/${NOW}-code-repository.tar.bz`;
    run(`tar cvfj "${TEMP_NAME}" "${HOME_TO}/Code"`);
    run(`gpg --yes --batch --passphrase="${GPG_PASSPHRASE}" -c "${TEMP_NAME}"`);
    unlink(TEMP_NAME);

    console.log('Bundle and encryption completed.');
}

/**
 * SEND TO AWS GLACIER
 */

async function upload() {
    return await glacier.upload('CodeBackups', `/tmp/${NOW}-code-repository.tar.bz.gpg`).catch(() => {
        console.log('Upload failed!')
    });
}

/**
 * Init
 */

async function main() {
    mountDrive();
    syncDirs();
    bundleAndEncrypt();
    await upload();
    unmountDrive();
}

main().then(() => {
    const duration = (new Date() - started) / 1000;
    console.log(`Backup Duration: ${duration} seconds`);
    console.log('Finished Backup!');
}).catch((err) => {
    console.error('Backup Failed!');
});
