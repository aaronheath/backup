#!/usr/bin/env node

const config = require('./.config');
const utils = require('./utils');
const xps = require('./xps-common');

const mountphrase = config.mount_phrase;

const EXTERNAL_DRIVE_MOUNTPOINT = '/media/aaronheath/2CBF65160A60F336';
const USB_DIR_TO_MOUNT = `${EXTERNAL_DRIVE_MOUNTPOINT}/xps`;
const MOUNTPOINT = `${EXTERNAL_DRIVE_MOUNTPOINT}/xps`;

async function main() {
    utils.headingMsg(`MOUNTING XPS BACKUPS`);

    xps.mountDrive(USB_DIR_TO_MOUNT, MOUNTPOINT, mountphrase);
}

main().catch((err) => {
    utils.rowStars('red');
    utils.msg('Backup Failed', 'red');
    console.log(err);
    utils.rowStars('red');
});
