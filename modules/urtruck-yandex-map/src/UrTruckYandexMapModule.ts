import { NativeModule, requireNativeModule } from 'expo';

declare class UrTruckYandexMapModule extends NativeModule<{}> {}

export default requireNativeModule<UrTruckYandexMapModule>('UrTruckYandexMap');
