import React from 'react';
import { requireNativeView } from 'expo';
import type { ViewProps } from 'react-native';

export type MapPoint = { lat: number; lng: number };

export type UrTruckYandexMapProps = ViewProps & {
  apiKey?: string;
  latitude: number;
  longitude: number;
  zoom?: number;
  title?: string;
  route?: MapPoint[];
  onMapLoaded?: (event: { nativeEvent?: Record<string, unknown> }) => void;
  onMapError?: (event: { nativeEvent?: Record<string, unknown> }) => void;
};

type NativeProps = Omit<UrTruckYandexMapProps, 'route'> & { routeJson?: string };
const NativeView = requireNativeView<NativeProps>('UrTruckYandexMap');

export default function UrTruckYandexMapView({ route, zoom = 10, ...props }: UrTruckYandexMapProps) {
  return <NativeView {...props} zoom={zoom} routeJson={route ? JSON.stringify(route) : undefined} />;
}
