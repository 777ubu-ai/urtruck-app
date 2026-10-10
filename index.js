import '@expo/metro-runtime';
import { registerRootComponent } from 'expo';
import App from './App';
import { initializeOneSignalPilot } from './src/utils/oneSignalPilot';

initializeOneSignalPilot();

registerRootComponent(App);
