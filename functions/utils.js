const { sample } = require('lodash')

function getRandomRadioForChip () {
  return sample([
    '47 FM',
    'Beur FM',
    'Chérie',
    'Fip',
    'FM 43',
    'FMR',
    'Forum',
    'Gold FM',
    'Latina',
    'M Radio',
    'Mona FM',
    'Mouv',
    'Nova',
    'NRadio',
    'NRJ',
    'Oui FM',
    'Radio 6',
    'RCF',
    'RFM',
    'RMC',
    'RTL',
    'RTL 2',
    'RTS',
    'RVA',
    'RVM',
    'Skyrock',
    'Swigg',
    'Voltage',
    'Wit FM'
  ])
}

module.exports = {
  getRandomRadioForChip
}
