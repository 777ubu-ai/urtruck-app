// Архив не должен предлагать повторную публикацию объявлений, занятых сделкой.
export const canRepublishOwnedHistory = (status) =>
  ['unpublished', 'cancelled', 'rejected'].includes(status);

export const isOwnedHistory = (item, isDriver) =>
  !!item.status && item.status !== 'active' && !(isDriver && item.status === 'draft');
