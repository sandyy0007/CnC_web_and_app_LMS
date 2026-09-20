'use client';

import { Award, Flame, Lock, ShieldCheck, Zap } from 'lucide-react';

import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bits';
import { StatusBadge } from '@/components/shared/status-badge';
import { AsyncSection } from '@/components/shared/state';
import { Card, CardBody, CardHeader, CardSubtitle, CardTitle } from '@/components/ui/card';
import { useApi } from '@/hooks/useApi';
import { cn } from '@/lib/cn';
import { formatDate, num, pct } from '@/lib/format';
import { iconFor } from '@/lib/icons';

export default function AchievementsPage() {
  const query = useApi<any>('/student/achievements');

  return (
    <AsyncSection query={query} skeleton="cards">
      {(data) => (
        <>
          <PageHeader
            title="Achievements"
            description="Badges are earned from real activity, and certificates only issue when the criteria are actually met."
          />

          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Experience</p>
                <p className="tnum mt-1.5 flex items-center gap-1.5 text-[22px] font-bold leading-none">
                  <Zap className="size-4 text-amber" aria-hidden />
                  {num(data.xp.total)} XP
                </p>
                <ProgressBar
                  className="mt-3"
                  showValue={false}
                  value={
                    ((data.xp.total - data.xp.levelFloor) /
                      Math.max(1, data.xp.levelCeiling - data.xp.levelFloor)) *
                    100
                  }
                />
                <p className="mt-1.5 text-xs text-ink-3">
                  Level {data.xp.level} · {num(data.xp.thisWeek)} XP this week
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Streak</p>
                <p className="tnum mt-1.5 flex items-center gap-1.5 text-[22px] font-bold leading-none">
                  <Flame className="size-4 text-amber" aria-hidden />
                  {data.streak.days} days
                </p>
                <p className="mt-3 text-xs text-ink-3">
                  Last active {data.streak.lastActiveOn}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-xs uppercase tracking-wider text-ink-2">Badges earned</p>
                <p className="tnum mt-1.5 text-[22px] font-bold leading-none">
                  {data.badges.filter((badge: any) => badge.earned).length}
                  <span className="text-[14px] font-semibold text-ink-3">
                    /{data.badges.length}
                  </span>
                </p>
                <p className="mt-3 text-xs text-ink-3">
                  Progress towards the rest is shown on each badge.
                </p>
              </CardBody>
            </Card>
          </div>

          <h2 className="mb-3 text-md font-semibold">Badges</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.badges.map((badge: any) => {
              const Icon = iconFor(badge.icon, Award);
              return (
                <Card key={badge.code} className={cn(!badge.earned && 'bg-app/60')}>
                  <CardBody className="flex items-start gap-3.5">
                    <span
                      className={cn(
                        'flex size-11 shrink-0 items-center justify-center rounded-[12px]',
                        badge.earned ? 'text-white' : 'bg-line-soft text-ink-3',
                      )}
                      style={badge.earned ? { background: badge.color } : undefined}
                      aria-hidden
                    >
                      {badge.earned ? (
                        <Icon className="size-5" />
                      ) : (
                        <Lock className="size-[18px]" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-md font-semibold">{badge.title}</p>
                      <p className="mt-0.5 text-sm leading-relaxed text-ink-2">
                        {badge.description}
                      </p>
                      {badge.earned ? (
                        <p className="mt-2 text-xs font-semibold text-success">Earned</p>
                      ) : (
                        <ProgressBar
                          className="mt-2.5"
                          value={badge.progressPercent}
                          showValue={false}
                          thin
                        />
                      )}
                      {!badge.earned && (
                        <p className="mt-1.5 text-xs text-ink-3">
                          {pct(badge.progressPercent, 0)} there
                        </p>
                      )}
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>

          <h2 className="mb-3 mt-8 text-md font-semibold">Certificates</h2>
          {data.certificates.length === 0 ? (
            <Card>
              <CardBody className="py-8 text-center text-base text-ink-2">
                No certificate record has been opened for you yet.
              </CardBody>
            </Card>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {data.certificates.map((certificate: any) => (
                <Card key={certificate.id}>
                  <CardHeader>
                    <div>
                      <CardTitle>{certificate.templateName}</CardTitle>
                      <CardSubtitle>
                        {certificate.batchName}
                        {certificate.issuedAt ? ` · issued ${formatDate(certificate.issuedAt)}` : ''}
                      </CardSubtitle>
                    </div>
                    <StatusBadge status={certificate.status} />
                  </CardHeader>
                  <CardBody>
                    <dl className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <dt className="text-xs text-ink-3">Attendance</dt>
                        <dd className="tnum text-md font-semibold">
                          {pct(certificate.attendancePct, 1)}
                          <span className="ml-1 text-xs font-normal text-ink-3">
                            (needs {pct(certificate.criteria?.minAttendance, 0)})
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-ink-3">Average score</dt>
                        <dd className="tnum text-md font-semibold">
                          {num(certificate.avgScore, 1)}
                          <span className="ml-1 text-xs font-normal text-ink-3">
                            (needs {num(certificate.criteria?.minAvgScore, 0)})
                          </span>
                        </dd>
                      </div>
                    </dl>
                    {certificate.reason && (
                      <p className="mt-3.5 flex items-start gap-2 rounded-[10px] bg-amber-50 px-3.5 py-2.5 text-sm text-amber-dark">
                        <ShieldCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                        {certificate.reason}
                      </p>
                    )}
                    {certificate.certificateNo && (
                      <p className="mt-3 text-xs text-ink-3">
                        Certificate no. {certificate.certificateNo}
                      </p>
                    )}
                  </CardBody>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </AsyncSection>
  );
}
