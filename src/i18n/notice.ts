import type {TFunction} from 'i18next';
import type {Notice} from '../messages.ts';

export function translateNotice(t: TFunction, notice: Notice): string {
  switch (notice.code) {
    case 'missingOutput':
    case 'needsLb':
    case 'updatedLog':
    case 'onlineLog':
    case 'offlineLog':
      return t(notice.code, {node: notice.node});
    case 'burstLog':
      return t(notice.code, {
        multiplier: String(notice.multiplier),
        seconds: String(notice.seconds),
      });
    case 'lossesLog':
      return t(notice.code, {rejected: String(notice.rejected), dropped: String(notice.dropped)});
    case 'pressureLog':
      return t(notice.code, {value: String(notice.value)});
    case 'missingSource':
    case 'uniqueIds':
    case 'designLimits':
    case 'sourceOutputOnly':
    case 'missingNode':
    case 'cycle':
    case 'readyLog':
    case 'missionLog':
    case 'missionToast':
    case 'topologyUpdated':
    case 'maxNodes':
    case 'chooseOther':
    case 'exported':
    case 'imported':
    case 'importFailed':
    case 'fileTooLarge':
    case 'invalidFile':
    case 'invalidShape':
    case 'invalidNode':
    case 'duplicateIds':
    case 'invalidEdge':
      return t(notice.code);
  }
}
