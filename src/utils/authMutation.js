let authMutationChain = Promise.resolve();

export function runAuthMutation(operation) {
  const job = authMutationChain.then(operation);
  authMutationChain = job.catch(() => {});
  return job;
}

// Проверка владельца и запись токена выполняются в очереди входа/выхода.
export function commitVerifiedLogin({ expectedToken, readToken, write, isCurrent = () => true }) {
  return runAuthMutation(async () => {
    if (!isCurrent() || await readToken() !== expectedToken || !isCurrent()) return false;
    await write();
    return true;
  });
}
