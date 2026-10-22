"""Проверка итогового XML manifest, выгруженного bundletool из AAB."""
import sys
import xml.etree.ElementTree as ET

ANDROID = '{http://schemas.android.com/apk/res/android}'


def verify(xml):
    root = ET.fromstring(xml)
    forbidden = {'android.permission.ACCESS_BACKGROUND_LOCATION', 'android.permission.FOREGROUND_SERVICE_LOCATION'}
    for element in root:
        if element.tag.startswith('uses-permission') and element.get(ANDROID + 'name') in forbidden:
            raise ValueError('Запрещённое разрешение фоновой геолокации')
    for service in root.findall('./application/service'):
        if service.get(ANDROID + 'name') == 'expo.modules.location.services.LocationTaskService':
            raise ValueError('В итоговом manifest осталась LocationTaskService')
        value = service.get(ANDROID + 'foregroundServiceType', '')
        if 'location' in value.split('|'):
            raise ValueError('В итоговом manifest осталась foreground service типа location')
        if value:
            try:
                mask = int(value, 0)
            except ValueError:
                if not all(part in {'camera', 'connectedDevice', 'dataSync', 'health', 'mediaPlayback', 'mediaProjection', 'microphone', 'phoneCall', 'remoteMessaging', 'shortService', 'specialUse', 'systemExempted', 'mediaProcessing'} for part in value.split('|')):
                    raise ValueError('Неизвестный тип foreground service')
            else:
                if mask & 8:
                    raise ValueError('В итоговом manifest осталась маска foreground location')


if __name__ == '__main__':
    verify(sys.stdin.read())
    print('PASS: итоговый manifest без background/location foreground service')
