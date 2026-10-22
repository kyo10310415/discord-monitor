export interface MonitorResult {
  channelsChecked: number;
  alertsSent: number;
  errors: unknown[];
  inactiveChannels: unknown[];
}

export function summarizeResult(result: MonitorResult) {
  return {
    channelsChecked: result.channelsChecked,
    alertsSent: result.alertsSent,
    errorCount: result.errors.length,
    inactiveCount: result.inactiveChannels.length,
  };
}

export function summarizeLog(log: Record<string, unknown>) {
  let inactiveCount = 0;
  let errorCount = log.error_message ? 1 : 0;
  try {
    const details = JSON.parse(String(log.channel_details || 'null'));
    if (Array.isArray(details)) errorCount = details.length;
    else if (details && typeof details === 'object') {
      inactiveCount = Array.isArray(details.inactive) ? details.inactive.length : 0;
      errorCount = Array.isArray(details.errors) ? Math.max(details.errors.length, errorCount) : errorCount;
    }
  } catch { /* Older or malformed details must not be exposed to the client. */ }
  return {
    id: log.id,
    checked_at: log.checked_at,
    channels_checked: log.channels_checked,
    alerts_sent: log.alerts_sent,
    status: log.status,
    inactive_count: inactiveCount,
    error_count: errorCount,
  };
}
