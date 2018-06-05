#!/usr/bin/env node

const utils = require('./utils');
const config = require('./.config');

async function main() {
    utils.bundleAndEncrypt(
        config.drop_vault,
        config.drop_dir_path,
        config.gpg_pass_phrase
    );

    await utils.upload(config.drop_vault);
}

main().catch((err) => {
    utils.rowStars('red');
    utils.msg('Backup Failed', 'red');
    console.log('error', err);
    utils.rowStars('red');
});
