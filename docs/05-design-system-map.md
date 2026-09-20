# Design System Map — one product, role-specific workspaces

Tokens are lifted verbatim from the supplied `EEDI_LMS_Admin_Panel_UI_Showcase.html` so all four portals
share one visual language.

## Palette (CSS custom properties, `web/src/styles/globals.css`)
| Token | Value | Use |
|---|---|---|
| `--navy-950` | `#171340` | sidebar ground, dark stat card |
| `--navy-900` / `--navy-800` | `#1E1A4D` / `#292368` | gradients, hover |
| `--indigo` | `#4B3FE4` | primary action, active nav |
| `--indigo-600` | `#4338CA` | primary hover |
| `--indigo-50` / `--indigo-100` | `#EEECFE` / `#DEDAFB` | soft fills, avatars |
| `--amber` / `--amber-dark` / `--amber-50` | `#F2A93B` / `#B9740F` / `#FEF3E2` | accent, warning pill |
| `--bg-app` | `#F5F6FB` | application background |
| `--card` | `#FFFFFF` | surfaces |
| `--border` / `--border-soft` | `#E7E8F2` / `#EFF0F7` | dividers |
| `--text-1/2/3` | `#161327` / `#6B6C86` / `#9A9BB0` | body / secondary / muted |
| `--success` `--danger` `--info` `--purple` `--teal` | `#1E9E6B` `#DB4437` `#2F6FE4` `#8B5CF6` `#0EA5A0` | status semantics (each with `-bg`) |
| `--radius-card` / `--radius-sm` | `14px` / `8px` | rounding |
| `--shadow-card` / `--shadow-pop` | per showcase | elevation |

Typography: **Inter** for UI, **Source Serif 4** for accent headings only, tabular numerals for KPIs.

## Portal chrome
| Portal | Sidebar | Header context |
|---|---|---|
| Student | light sidebar, indigo active pill, "EEDI LMS / Student Portal" | global search + bell + help + avatar |
| Trainer | navy sidebar | batch/term context |
| HOD | navy sidebar + locked "Scope" group (Other Departments/Colleges) + data-isolation footnote | `College › Department` pill on **every** screen |
| Admin | navy sidebar, grouped Overview / Institution setup / Intelligence / Operations | institution search |

## Shared component inventory (`web/src/components/`)
`ui/` primitives: Button, Input, Select, Textarea, Checkbox, Switch, RadioGroup, Label, Card, Dialog,
DropdownMenu, Tabs, Tooltip, Popover, Badge, Avatar, Progress, ScrollArea, Separator, Skeleton, Table,
Accordion, Toast(sonner).

`shared/`: **StatCard, DataTable, FilterBar, SearchInput, StatusBadge, EmptyState, ErrorState,
LoadingSkeleton, ChartCard, PageHeader, Breadcrumbs, ConfirmDialog, UserAvatar, NotificationMenu,
ProfileMenu, FileUpload, ProgressBar, ScoreCard, SkillBreakdown, ActivityCard, ReportDownload,
AuditTable** — plus RingScore, TrendLine, Pagination, ScopePill, KeyboardHint.

`charts/`: LineTrend, BarCompare, StackedDistribution, RadialScore (Recharts, tokenised colours).

Rule: a portal never forks a component to restyle it — variants live in the component.
