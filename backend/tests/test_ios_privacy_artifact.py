"""Apple90683 воспроизводится на фактической структуре IPA без устройства."""
import importlib.util
import json
from pathlib import Path
import plistlib
import zipfile

import pytest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('ios_privacy', ROOT / 'scripts/verify_ios_privacy_artifact.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


@pytest.mark.parametrize('purpose', [None, '', '   ', False])
def test_missing_or_empty_purpose_rejected(tmp_path, purpose):
    path = tmp_path / 'old.ipa'
    info = {} if purpose is None else {'NSMotionUsageDescription': purpose}
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('Payload/UrTruck.app/Info.plist', plistlib.dumps(info))
    with pytest.raises(ValueError, match='90683'):
        module.verify(path)


def test_native_and_expo_metadata_survive_ipa_packaging(tmp_path):
    info = plistlib.loads((ROOT / 'ios/UrTruck/Info.plist').read_bytes())
    config = json.loads((ROOT / 'app.json').read_text())['expo']['ios']['infoPlist']
    assert info['NSMotionUsageDescription'] == config['NSMotionUsageDescription']
    assert 'не запрашивает и не собирает' in info['NSMotionUsageDescription']
    path = tmp_path / 'new.ipa'
    with zipfile.ZipFile(path, 'w') as archive:
        archive.writestr('Payload/UrTruck.app/Info.plist', plistlib.dumps(info))
    assert module.verify(path)['NSMotionUsageDescription'] == config['NSMotionUsageDescription']
    assert info['UIBackgroundModes'] == ['remote-notification']
    assert not any(key.startswith('NSLocationAlways') for key in info)
