// Minimal render-test substitute. Production always loads react-native-svg.
import React from './react-stub.mjs';

export const SvgXml = (props) => React.createElement('SvgXml', props);
SvgXml.displayName = 'SvgXml';
