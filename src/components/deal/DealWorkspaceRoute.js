import React from 'react';

import DealLocationPermissionGate from './DealLocationPermissionGate';
import DealWorkspaceScreenV2 from '../../screens/DealWorkspaceScreenV2';

// Canonical route-level host for every accepted-deal workspace entry point.
// Keep DealWorkspaceScreenV2 focused on the workspace itself; every navigation
// route must render it through this component so Start trip can never miss the
// prominent location disclosure/permission coordinator.
export default function DealWorkspaceRoute(props) {
  const params = props?.route?.params || {};

  return (
    <DealLocationPermissionGate role={params.role}>
      <DealWorkspaceScreenV2 {...props} />
    </DealLocationPermissionGate>
  );
}
