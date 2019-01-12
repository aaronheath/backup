const execSync = require('child_process').execSync;
const utils = require('./utils');

const PASSPHRASE_TEMP_FILE = '/tmp/passphrase.txt';

function mountDrive(usbDirToMount, mountpoint, mountphrase) {
    utils.msg('Evaluating whether to mount drive', 'blue');

    const mountReturn = execSync('mount').toString();

    if(mountReturn.includes(mountpoint)) {
        return utils.msg(`${mountpoint} is already mounted!`, 'blue');
    }

    utils.pipe([
        `printf "%s" "${mountphrase}"`,
        `ecryptfs-add-passphrase > "${PASSPHRASE_TEMP_FILE}"`,
    ]);

    const sig = utils.pipe([
        `tail -1 "${PASSPHRASE_TEMP_FILE}"`,
        'awk \'{print $6}\'',
        'sed "s/\\[//g"',
        'sed "s/\\]//g"',
        'sed "s/ //g"',
    ]).toString();

    utils.unlink(PASSPHRASE_TEMP_FILE);

    mount(mountphrase, utils.toOneLine(sig, true), usbDirToMount, mountpoint);

    utils.msg(`${mountpoint} has been mounted!`, 'blue');
}

function mount(passphrase, signature, pathToMount, pathToMountAt) {
    const cmd = `sudo mount -t ecryptfs -o key=passphrase:passphrase_passwd=${passphrase},no_sig_cache=yes,verbose=no,cryptfs_sig=${signature},ecryptfs_cipher=aes,ecryptfs_key_bytes=16,ecryptfs_passthrough=no,ecryptfs_enable_filename_crypto=yes,ecryptfs_fnek_sig=${signature} "${pathToMount}" "${pathToMountAt}"`;

    utils.run(cmd);
    utils.msg(`${pathToMount} has been mounted at ${pathToMountAt}!`, 'blue');
}

function unmountDrive(mountpoint, externalDriveMountpoint) {
    const mountReturn = execSync('mount').toString();

    if(!mountReturn.includes(mountpoint)) {
        return console.log(`Unable to unmount ${mountpoint} is not mounted!`.blue);
    }

    utils.run(`sudo umount ${mountpoint}`);
    utils.msg(`Unmounted encrypted share at ${mountpoint}`, 'blue');

    utils.run(`sudo umount ${externalDriveMountpoint}`);
    utils.msg(`Unmounted external drive at ${externalDriveMountpoint}`, 'blue');
}

module.exports = {
    mountDrive,
    unmountDrive
};
