import 'server-only';

export function notificationDispatchScope() {
  switch (process.env.OPERATOR_NOTIFICATION_DISPATCH_TRANSPORT) {
    case undefined: return 'all';
    case 'telegram': return 'telegram';
    default: return null;
  }
}
