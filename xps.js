#!/usr/bin/env node

const execSync = require('child_process').execSync;
const fs = require('fs');
const table = require('cli-table');
const config = require('./.config');
const utils = require('./utils');
const xps = require('./xps-common');

const mountphrase = config.mount_phrase;

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

/**
 * Sync dirs from local to encrypted external
 */
function syncDirs() {
    // Create dir to copy to if it doesn't exist
    if(!fs.existsSync(TO)) {
        fs.mkdirSync(TO);

        utils.msg(`Created directory at ${TO}`, 'blue');
    }

    // Code Repositories
    const CODE_DIR = `${HOME}/code`;

    const rsyncCode = `
sudo rsync -ah --stats --delete --max-size="10000k"
--exclude="node_modules"
--exclude="storage"
--exclude="vendor"
--exclude=".vagrant"
"${CODE_DIR}" "${HOME_TO}"
`;

    console.log(rsyncCode);

    utils.run(utils.toOneLine(rsyncCode), true);
    utils.msg(`Rsync'd ${CODE_DIR} to ${HOME_TO}`, 'blue');

    // Documents
    utils.basicRsync(`${HOME}/Documents`, HOME_TO);

    // Pictures
    utils.basicRsync(`${HOME}/Pictures`, HOME_TO);

    // Videos
    utils.basicRsync(`${HOME}/Videos`, HOME_TO);

    // Virtual Boxes
    utils.basicRsync(`${HOME}/VirtualBox VMs`, HOME_TO);

    // Unlink insync logs db
    utils.unlink('/home/aaronheath/.config/Insync/logs.db');

    // My Config Files
    // TODO do I really need the sudo here, it triggers a password re-prompt, must be a better way of doing this
    const rsyncMyConfigFiles = `
sudo rsync -ah --stats --delete
--filter="merge ${__dirname}/xps-rsync-filter-file.txt"
"${HOME}/" "${HOME_TO}/my-configs"
`;

    utils.run(utils.toOneLine(rsyncMyConfigFiles), true);
    utils.msg(`Rsync'd ${HOME} to "${HOME_TO}/my-configs"`, 'blue');

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

    utils.run(utils.toOneLine(rsyncSystemFiles), true);
    utils.msg(`Rsync'd ${ROOT} to ${SYSTEM_TO}`, 'blue');
}


function currentDelta(splitStart) {
    const now = new Date();

    return {overall: (now - deltas.start) / 1000, split: (now - splitStart) / 1000, rawSplit: now};
}

/**
 * Init
 */
async function main() {
    utils.headingMsg(`XPS BACKUP
Started at: ${started}`);

    xps.mountDrive(USB_DIR_TO_MOUNT, MOUNTPOINT, mountphrase);
    deltas.mountDrive = currentDelta(deltas.start);

    syncDirs();
    deltas.syncDirs = currentDelta(deltas.mountDrive.rawSplit);

    const vault = 'CodeBackups';

    utils.bundleAndEncrypt(vault, `${HOME_TO}/code`, config.gpg_pass_phrase);
    deltas.bundleAndEncrypt = currentDelta(deltas.syncDirs.rawSplit);

    await utils.upload(vault);
    // await glacier.upload(vault, `/tmp/${utils.NOW}-code-repository.tar.bz.gpg`, true);
    deltas.upload = currentDelta(deltas.bundleAndEncrypt.rawSplit);

    xps.unmountDrive(MOUNTPOINT, EXTERNAL_DRIVE_MOUNTPOINT);
    deltas.unmountDrive = currentDelta(deltas.upload.rawSplit);

    const _table = new table({
        head: ['Task', 'Duration (sec)', 'Overall (sec)'],
    });

    _table.push(
        ['Mount Drive', deltas.mountDrive.split, deltas.mountDrive.overall],
        ['Sync Dirs', deltas.syncDirs.split, deltas.syncDirs.overall],
        ['Bundle & Encrypt', deltas.bundleAndEncrypt.split, deltas.bundleAndEncrypt.overall],
        ['Upload to Glacier', deltas.upload.split, deltas.upload.overall],
        ['Unmount Drive', deltas.unmountDrive.split, deltas.unmountDrive.overall],
    );

    utils.headingMsg('Backup Completed');
    console.log(_table.toString());
    utils.rowStars();
}

main().catch((err) => {
    utils.rowStars('red');
    utils.msg('Backup Failed', 'red');
    console.log(err);
    utils.rowStars('red');
});
