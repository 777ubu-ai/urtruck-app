# Physical push session — 9 October 2026 evening (Asia/Almaty)

Status: PARTIAL, not full acceptance.

Connected devices independently read:
- Huawei GRL_AL10: com.urtruck.app 1.0.9 / 213702394, ADB authorized.
- iPhone Bah (2), iPhone 15 Pro Max: paired CoreDevice, com.urtruck.app 1.0.9 / 95.
- OPPO absent from ADB during this session.

Huawei opened existing accepted serik / Khorgos–Nur Zholy–Moscow deal b930ef09-95d9-48de-8a81-bbcfe68e7f25.
ADB UI dump confirmed chat composer and send control; each send was followed by message appearing in the chat and empty composer.

| Test | iPhone state commanded | Huawei action | Evidence boundary |
|---|---|---|---|
| P1 | Not controlled in first send | Huawei push test p1. Please reply from iPhone. | Chat display and composer empty confirmed; receipt pending |
| P2 | UrTruck launched via devicectl | PUSH P2 - iPhone app open - Huawei 19:47 | Chat display confirmed; exact iPhone screen/current UID not read |
| P3 | Settings launched via devicectl, UrTruck background | PUSH P3 - iPhone background - Huawei 19:47 | Chat display confirmed; physical banner/sound pending |
| P4 | UrTruck process 9382 termination signal sent | PUSH P4 - iPhone process closed - Huawei 19:49 | Chat display confirmed; this is NOT manual removal from recents proof |

19:47 / 19:49 in message bodies are test labels, not exact send timestamps; remote tool logged process termination at 19:48:24.
Huawei returned to launcher after P4 to prepare reverse incoming test. No app force-stop, uninstall, clear-data or auth bypass.

Huawei notification inspection before sequence:
- POST_NOTIFICATION default mode allow.
- Two UrTruck FCM notification records plus OS group summary existed.
- urtruck_messages_v2 effective importance=4, sound configured, vibration=true, badge=true.
- UserLockedFields=4 and original importance=5 observed. This does not prove the reason a heads-up banner was missing, or that current P2–P4 were received on iPhone.

iPhone physical UI automation endpoint was unavailable (no WDA response). CoreDevice can launch/terminate, but does not provide tap/chat read/lockscreen proof in this setup.
Required next: owner confirm P2/P3/P4 on iPhone, reply from same participant account while Huawei background; record incoming notification, tap target, unread/read/badge. Then lockscreen and manual recents removal on both devices, OPPO separately.

New unified native jobs started exactly once:
- Android https://github.com/777ubu-ai/urtruck-app/actions/runs/37945674289 : internal / completed (testing), source c39af30; all three quality jobs PASS; native build/upload in progress.
- iOS https://github.com/777ubu-ai/urtruck-app/actions/runs/37945679955 : frozen app source d41c51c, guard build >95; all three quality jobs PASS; native build/upload in progress.
- c39af30 only changes build workflow; app code same as d41c51c / 06526f4. No public rollout triggered.

Latest notification-read and no-repeat-vehicle fixes are in these build sources, but not installed on the devices above yet. Server read-boundary patch remains prepared, not deployed.
