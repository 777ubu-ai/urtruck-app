# PRE-FLIGHT: фактический PM2 CLI

Базаc6f250ff10cde8a49b8c43229bce8e69424d2bc2, fix/production-pm2-runtime-20261023.
Узкийrun39967482459 прошёлвесьqualitygate, затем остановилсядоbackup/записи: pm2_identity_unavailable.
Readonlyфакт: daemonPID1680977 использует /usr/bin/node; backendPID1681038, pm_id3, root/home/ubuntu/urtruck/backend, PM2_HOME/home/ubuntu/.pm2. CLIсуществуетв/home/ubuntu/.nvm/versions/node/v22.15.0/bin/pm2 и ссылаетсянаlib/node_modules/pm2/bin/pm2. Предположение node.parent/pm2 неверно.
Патчтолькоwriter: точныйпроверенныйCLI+canonicaltarget+executable, прежниеPM2_HOME/daemon/backendguards, явныйPM2_HOMEприrestart. Никакихновыхключей, runtimeкоднепишетсядоуспешныхпроверок.
Адресныерегрессииотдельногопути,подменыссылки,отсутствия/неисполняемогоCLI;review/CIпередповторомсуществующейпроцедуры.
