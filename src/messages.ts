// The engine emits data, not translated prose. Existing events can change language in the UI.
export type ValidationIssue =
  | {
      code:
        | 'missingSource'
        | 'uniqueIds'
        | 'designLimits'
        | 'sourceOutputOnly'
        | 'missingNode'
        | 'cycle';
    }
  | {code: 'missingOutput' | 'needsLb'; node: string};

export type Notice =
  | ValidationIssue
  | {
      code:
        | 'readyLog'
        | 'missionLog'
        | 'missionToast'
        | 'topologyUpdated'
        | 'maxNodes'
        | 'chooseOther'
        | 'exported'
        | 'imported'
        | 'importFailed'
        | 'fileTooLarge'
        | 'invalidFile'
        | 'invalidShape'
        | 'invalidNode'
        | 'duplicateIds'
        | 'invalidEdge';
    }
  | {code: 'updatedLog' | 'onlineLog' | 'offlineLog'; node: string}
  | {code: 'burstLog'; multiplier: number; seconds: number}
  | {code: 'lossesLog'; rejected: number; dropped: number}
  | {code: 'pressureLog'; value: number};

export class DesignError extends Error {
  readonly notice: Notice;

  constructor(notice: Notice) {
    super(notice.code);
    this.name = 'DesignError';
    this.notice = notice;
  }
}
