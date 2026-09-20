'use client';

import {
  ArrowRight,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  ExternalLink,
  Layers,
  Plus,
  Search,
  Sparkles,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/shared/page-header';
import { StatCard } from '@/components/shared/stat-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { GlobalPageBackground } from '@/components/ui/GlobalPageBackground';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { formatDate, num } from '@/lib/format';

interface SuperAdminCourse {
  id: string;
  title: string;
  slug: string;
  category: string;
  courseMode: string;
  availableModes: string[];
  price: number;
  currency: string;
  published: boolean;
  enrollmentOpen: boolean;
  trainerName: string;
  offlineEnrollments: number;
  onlineEnrollments: number;
  totalEnrollments: number;
  createdAt?: string;
}

export default function SuperAdminCoursesPage() {
  const query = useApi<SuperAdminCourse[]>('/super-admin/courses', undefined, {
    select: (res) => res.data ?? res,
  });

  const [createModalOpen, setCreateModalOpen] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [search, setSearch] = React.useState('');
  const [modeFilter, setModeFilter] = React.useState('all');

  // Form State
  const [title, setTitle] = React.useState('');
  const [slug, setSlug] = React.useState('');
  const [desc, setDesc] = React.useState('');
  const [category, setCategory] = React.useState('Employability');
  const [courseMode, setCourseMode] = React.useState<'ONLINE' | 'OFFLINE' | 'BOTH'>('BOTH');
  const [price, setPrice] = React.useState(4999);
  const [durationHours, setDurationHours] = React.useState(40);
  const [trainerName, setTrainerName] = React.useState('Lead Master Trainer');

  const courses: SuperAdminCourse[] = Array.isArray(query.data) ? query.data : [];

  const handleTitleChange = (val: string) => {
    setTitle(val);
    setSlug(
      val
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)+/g, '')
    );
  };

  const handleCreateCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !slug) return;
    setSubmitting(true);
    try {
      const availableModes = courseMode === 'BOTH' ? ['ONLINE', 'OFFLINE'] : [courseMode];
      await api.post('/super-admin/courses', {
        title: title.trim(),
        slug: slug.trim(),
        description: desc.trim(),
        category,
        courseMode,
        availableModes,
        price: Number(price),
        durationHours: Number(durationHours),
        trainerName: trainerName.trim(),
        published: true,
        enrollmentOpen: true,
      });

      toast.success('Course published and launched successfully!');
      setCreateModalOpen(false);
      setTitle('');
      setSlug('');
      setDesc('');
      query.refetch();
    } catch (err: any) {
      toast.error(err.message || 'Failed to create course.');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = courses.filter((c) => {
    const matchSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.slug.toLowerCase().includes(search.toLowerCase()) ||
      c.category.toLowerCase().includes(search.toLowerCase());
    const matchMode = modeFilter === 'all' || c.courseMode === modeFilter || c.availableModes?.includes(modeFilter);
    return matchSearch && matchMode;
  });

  const totalEnrollments = courses.reduce((acc, c) => acc + (c.totalEnrollments || 0), 0);
  const totalOffline = courses.reduce((acc, c) => acc + (c.offlineEnrollments || 0), 0);
  const totalOnline = courses.reduce((acc, c) => acc + (c.onlineEnrollments || 0), 0);

  return (
    <GlobalPageBackground image="/images/backgrounds/courses.webp" variant="dark">
      <div className="space-y-6">
      <PageHeader
        title="Course Launch & Catalog Control"
        description="Author, publish, and govern platform courses across institutional campus cohorts and direct online learners."
        actions={
          <Button
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="flex items-center gap-1.5"
          >
            <Plus className="size-4" />
            Launch New Course
          </Button>
        }
      />

      {/* Catalog Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Catalog Courses"
          value={num(courses.length)}
          tone="indigo"
          icon={<BookOpen className="size-4" />}
          hint="Active curriculums"
        />
        <StatCard
          label="Total Enrollments"
          value={num(totalEnrollments)}
          tone="teal"
          icon={<Users className="size-4" />}
          hint="Combined cohort size"
        />
        <StatCard
          label="Campus Cohort Learners"
          value={num(totalOffline)}
          tone="amber"
          icon={<Layers className="size-4" />}
          hint="College managed"
        />
        <StatCard
          label="Online Platform Learners"
          value={num(totalOnline)}
          tone="indigo"
          icon={<Sparkles className="size-4" />}
          hint="Direct platform participants"
        />
      </div>

      {/* Course Search and Filter Controls */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200 dark:border-slate-800">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search courses by title, slug, or domain..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
          />
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={modeFilter}
            onChange={(e) => setModeFilter(e.target.value)}
            className="text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 font-medium"
          >
            <option value="all">All Delivery Modes</option>
            <option value="ONLINE">Online Direct Only</option>
            <option value="OFFLINE">Offline Cohort Only</option>
            <option value="BOTH">Dual Mode (Online + Offline)</option>
          </select>
        </div>
      </div>

      {/* Courses Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {filtered.map((course) => (
          <Card key={course.id} className="group hover:border-indigo transition-all shadow-xs hover:shadow-md flex flex-col justify-between">
            <CardHeader className="p-5 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-start justify-between gap-2">
                <Badge tone={course.courseMode === 'ONLINE' ? 'indigo' : course.courseMode === 'OFFLINE' ? 'teal' : 'purple'}>
                  {course.courseMode === 'BOTH' ? 'ONLINE + OFFLINE' : course.courseMode}
                </Badge>
                <Badge tone={course.published ? 'success' : 'neutral'}>
                  {course.published ? 'Published' : 'Draft'}
                </Badge>
              </div>
              <h2 className="text-base font-bold text-slate-900 dark:text-white mt-2 group-hover:text-indigo transition-colors">
                {course.title}
              </h2>
              <p className="text-xs text-slate-500 font-mono mt-0.5">/{course.slug}</p>
            </CardHeader>
            <CardBody className="p-5 space-y-4">
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-[10px] text-slate-400 font-medium">Fee</p>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {course.price > 0 ? `₹${num(course.price)}` : 'Free'}
                  </p>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-[10px] text-slate-400 font-medium">Campus</p>
                  <p className="font-bold text-emerald-600">{num(course.offlineEnrollments)}</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60">
                  <p className="text-[10px] text-slate-400 font-medium">Online</p>
                  <p className="font-bold text-indigo">{num(course.onlineEnrollments)}</p>
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">
                <span>Faculty: <strong>{course.trainerName}</strong></span>
                <span>{course.category}</span>
              </div>

              <Button asChild variant="secondary" size="sm" className="w-full text-xs">
                <Link href={`/super-admin/courses/${course.id}`} className="flex items-center justify-center gap-1.5">
                  Open Control Center
                  <ArrowRight className="size-3.5" />
                </Link>
              </Button>
            </CardBody>
          </Card>
        ))}
      </div>

      {/* Course Launch Modal */}
      <Dialog open={createModalOpen} onOpenChange={setCreateModalOpen}>
        <DialogContent wide className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Launch New Course Curricula</DialogTitle>
            <DialogDescription>
              Configure delivery mode, pricing, trial configuration, and availability.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateCourse} className="p-6 space-y-4 text-xs">
            <Field label="Course Title" htmlFor="cTitle" required>
              <Input
                id="cTitle"
                required
                value={title}
                onChange={(e) => handleTitleChange(e.target.value)}
                placeholder="e.g. Master Full Stack Engineering"
              />
            </Field>

            <Field label="URL Slug" htmlFor="cSlug" required>
              <Input
                id="cSlug"
                required
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="master-full-stack-engineering"
                className="font-mono text-xs"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Delivery Mode" htmlFor="cMode" required>
                <select
                  id="cMode"
                  value={courseMode}
                  onChange={(e) => setCourseMode(e.target.value as any)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                >
                  <option value="BOTH">Dual Mode (ONLINE + OFFLINE)</option>
                  <option value="ONLINE">Online Direct Only</option>
                  <option value="OFFLINE">Offline Campus Only</option>
                </select>
              </Field>

              <Field label="Course Fee (INR)" htmlFor="cPrice">
                <Input
                  id="cPrice"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Category / Pillar" htmlFor="cCategory">
                <select
                  id="cCategory"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white font-medium"
                >
                  <option value="Employability">Employability Skills</option>
                  <option value="Technical">Technical &amp; Coding</option>
                  <option value="Communication">Business Communication</option>
                  <option value="Aptitude">Quantitative Aptitude</option>
                  <option value="Soft Skills">Personality &amp; Soft Skills</option>
                </select>
              </Field>

              <Field label="Course Duration (Hours)" htmlFor="cDur">
                <Input
                  id="cDur"
                  type="number"
                  value={durationHours}
                  onChange={(e) => setDurationHours(Number(e.target.value))}
                />
              </Field>
            </div>

            <Field label="Course Description" htmlFor="cDesc">
              <textarea
                id="cDesc"
                rows={2}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="Provide learning outcomes, prerequisites, and evaluation milestones."
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 bg-white"
              />
            </Field>

            <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setCreateModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                loading={submitting}
                disabled={submitting || !title}
              >
                Publish &amp; Launch Course
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  </GlobalPageBackground>
  );
}

