'use strict';

const si = require('systeminformation');
const speedTest = require('speedtest-net');

function networkSpeed(){
    return new Promise((resolve, reject) => {
        let test = speedTest({ maxTime: 5000 });
        test.on('data', data => resolve({ download: data.speeds.download, upload: data.speeds.upload }));
        test.on('error', err => reject(err));
    });
}

function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    let k = 1024;
    let dm = decimals < 0 ? 0 : decimals;
    let sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    let i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}


async function info(){
    let os = await si.osInfo();
    let cpu = await si.cpu();
    let ram = await si.mem();
    let hdd = (await si.blockDevices()).filter(device => ['ssd', 'part'].indexOf(device.type) !== -1).reduce((acc, device) => acc + device.size, 0);
    let speed = await networkSpeed();
    return {
        operating_system: os.distro + ' ' + os.release + ' - ' + os.arch,
        cpu: cpu.manufacturer + cpu.brand + ' - ' + cpu.speed + ' x ' + cpu.cores,
        ram: formatBytes(ram.total),
        hdd: formatBytes(hdd),
        network_speed: 'download ' + speed.download + ' mb/s' + ' - ' + 'upload ' + speed.upload + ' mb/s' 
    };
}

module.exports = info;