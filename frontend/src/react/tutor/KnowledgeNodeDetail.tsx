import { useState } from 'react';
import { Button } from '../ui/shadcn/button';
import { Label } from '../ui/shadcn/label';
import { Textarea } from '../ui/shadcn/textarea';

export interface KnowledgeHistoryItem {
  date: string;
  summary: string;
}

export interface KnowledgeNodeDetailProps {
  index: number;
  status: string;
  statusLabel: string;
  goLabel: string;
  goTitle: string;
  confidenceLabel: string;
  confidenceSetLabel: (value: number) => string;
  confidenceScore: number;
  systemNoteLabel: string;
  systemNote: string;
  noSystemNote: string;
  userNoteLabel: string;
  userNote: string;
  userNotePlaceholder: string;
  historyLabel: string;
  history: KnowledgeHistoryItem[];
  noHistory: string;
  onGo: () => void;
  onConfidenceChange: (value: number) => void;
  onUserNoteChange: (value: string) => void;
}

export function KnowledgeNodeDetail(props: KnowledgeNodeDetailProps) {
  const [confidence, setConfidence] = useState(props.confidenceScore);
  const [userNote, setUserNote] = useState(props.userNote);
  const setScore = (value: number) => {
    const next = confidence === value ? 0 : value;
    setConfidence(next);
    props.onConfidenceChange(next);
  };

  return (
    <>
      <div className="kb-detail-head">
        <div className={`kb-detail-status kb-detail-status-${props.status}`}>{props.statusLabel}</div>
        <Button type="button" size="sm" variant="outline" className="kb-go-btn" data-go={props.index} title={props.goTitle} onClick={props.onGo}>
          {props.goLabel}
        </Button>
      </div>
      <div className="kb-detail-row">
        <span className="kb-detail-label">{props.confidenceLabel}</span>
        <div className="kb-conf-row" role="group" aria-label={props.confidenceLabel}>
          {Array.from({ length: 5 }, (_, index) => {
            const value = index + 1;
            const selected = value <= confidence;
            return (
              <Button
                key={value}
                type="button"
                size="icon-xs"
                variant={selected ? 'secondary' : 'outline'}
                className={`kb-conf-dot${selected ? ' on' : ''}`}
                data-conf={value}
                aria-label={props.confidenceSetLabel(value)}
                aria-pressed={selected}
                title={props.confidenceSetLabel(value)}
                onClick={() => setScore(value)}
              />
            );
          })}
        </div>
      </div>
      <div className="kb-detail-row">
        <span className="kb-detail-label">{props.systemNoteLabel}</span>
        <div className="kb-system-note">{props.systemNote || <em className="text-muted-foreground">{props.noSystemNote}</em>}</div>
      </div>
      <div className="kb-detail-row">
        <Label className="kb-detail-label" htmlFor={`kbUserNote-${props.index}`}>{props.userNoteLabel}</Label>
        <Textarea
          className="kb-user-note min-h-[54px] rounded-md bg-background px-2.5 py-2 text-sm"
          id={`kbUserNote-${props.index}`}
          name="kbUserNote"
          rows={3}
          placeholder={props.userNotePlaceholder}
          value={userNote}
          onChange={(event) => {
            setUserNote(event.currentTarget.value);
            props.onUserNoteChange(event.currentTarget.value);
          }}
        />
      </div>
      <div className="kb-detail-row">
        <span className="kb-detail-label">{props.historyLabel}</span>
        {props.history.length ? (
          <ul className="kb-history">
            {props.history.map((item, index) => (
              <li key={`${item.date}-${index}`}><span className="kb-hist-date">{item.date}</span>{item.summary}</li>
            ))}
          </ul>
        ) : <div className="kb-history-empty">{props.noHistory}</div>}
      </div>
    </>
  );
}
