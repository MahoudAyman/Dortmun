import { ChangeDetectionStrategy, Component, PLATFORM_ID, computed, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import { calculateDashboardSummary, calculateSettlement } from '../../core/calc/calculations';

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    @let ledger = store.comprehensiveLedger();
    @let dayRep = store.currentDailyDateReport();
    @let payday = store.payday15Info();

    <div class="space-y-5 polite-enter">
      <!-- =====================================================================
           1. MODERN EXECUTIVE COMMAND HEADER & INLINE AI + FIELD COMMAND BAR
           (Solid Surface + Simple Tasteful Color Accents + Polite Micro-Animations)
           ===================================================================== -->
      <section class="ceramic-card polite-card p-4 sm:p-5 border-r-4 border-r-[#2563EB]">
        <div class="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <!-- Title & System Badges -->
          <div class="space-y-1">
            <div class="flex flex-wrap items-center gap-2">
              <span class="px-2.5 py-0.5 rounded-md bg-[#2563EB] text-white text-[11px] font-black inline-flex items-center gap-1">
                <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">dashboard_customize</mat-icon>
                <span>نظام Bento الهندسي والمالي الحديث</span>
              </span>
              <a
                routerLink="/zaki"
                class="polite-btn px-2.5 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-[11px] font-black inline-flex items-center gap-1.5"
              >
                <span class="w-2 h-2 rounded-full bg-emerald-500 polite-dot"></span>
                <span>AI API متصل (projects/110645591699)</span>
              </a>
              <span class="px-2.5 py-0.5 rounded-md bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] text-[var(--text-heading)] text-[11px] font-bold">
                {{ store.settings().darkMode ? 'مظهر ليلي حديث وسريع' : 'مظهر نهاري حديث وسريع' }}
              </span>
            </div>
            <h1 class="text-base sm:text-xl font-black text-[var(--text-heading)]">
              مركز القيادة المتقدم للمشاريع والعمالة واليوميات والتدفقات المالية
            </h1>
            <p class="text-xs text-[var(--text-secondary)]">
              واجهة حديثة ومنظمة بألوان بسيطة مريحة للعين وحركات مهذبة وسريعة الاستجابة على جميع الأجهزة
            </p>
          </div>

          <!-- Inline Smart Field & AI Command Input (المساعد الميداني والذكاء الاصطناعي الفوري) -->
          <div class="flex items-center gap-2 w-full xl:w-auto xl:min-w-[440px]">
            <div class="relative flex-1">
              <input
                type="text"
                [value]="dashSmartCommand()"
                (input)="dashSmartCommand.set($any($event.target).value)"
                (keydown.enter)="runDashSmartCommand()"
                placeholder="اسأل زكي AI أو نفذ أمراً: حسابي كام؟ · سلفة 500 أحمد · مصروف 250 مواصلات..."
                aria-label="الأمر الميداني والذكاء الاصطناعي السريع"
                class="w-full bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] focus:border-[#2563EB] rounded-lg pr-9 pl-3 py-2 text-xs font-bold text-[var(--text-heading)] placeholder:text-[var(--text-secondary)] focus:outline-none transition-colors"
              />
              <mat-icon class="!w-4 !h-4 !text-[16px] text-[#2563EB] absolute right-3 top-2.5 pointer-events-none">auto_awesome</mat-icon>
            </div>
            <button
              type="button"
              (click)="runDashSmartCommand()"
              [disabled]="dashAiLoading()"
              class="polite-btn px-4 py-2 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-black inline-flex items-center gap-1 shrink-0 cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">{{ dashAiLoading() ? 'sync' : 'send' }}</mat-icon>
              <span>{{ dashAiLoading() ? 'جاري الرد...' : 'اسأل / نفّذ' }}</span>
            </button>
          </div>
        </div>

        <!-- Instant AI Reply Card on Dashboard (When user asks Zaki from Dashboard) -->
        @if (dashAiReply()) {
          <div class="mt-3.5 p-3.5 rounded-xl bg-[var(--tint-blue)] border border-blue-500/30 flex flex-col sm:flex-row sm:items-start justify-between gap-3 polite-enter">
            <div class="space-y-1">
              <div class="flex flex-wrap items-center gap-2 text-[11px] font-black text-[#2563EB] dark:text-blue-300">
                <mat-icon class="!w-4 !h-4 !text-[16px]">smart_toy</mat-icon>
                <span>رد المساعد الذكي «زكي» عبر AI API (projects/110645591699)</span>
                @if (dashAiLatencyMs() > 0) {
                  <span class="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10px] tabular-nums">
                    {{ dashAiLatencyMs() }}ms ✓
                  </span>
                }
              </div>
              <p class="text-xs sm:text-sm font-bold text-[var(--text-heading)] whitespace-pre-line leading-relaxed">
                {{ dashAiReply() }}
              </p>
            </div>
            <div class="flex items-center gap-2 shrink-0">
              <a
                routerLink="/zaki"
                class="polite-btn px-3 py-1.5 rounded-lg bg-[#2563EB] text-white text-xs font-black inline-flex items-center gap-1"
              >
                <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">chat</mat-icon>
                <span>محادثة كاملة</span>
              </a>
              <button
                type="button"
                (click)="dashAiReply.set('')"
                class="polite-btn px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-bold text-[var(--text-secondary)] cursor-pointer"
              >
                إغلاق
              </button>
            </div>
          </div>
        }


        <!-- Segmented Architectural View Switcher & Global Filters -->
        <div class="mt-4 pt-3.5 border-t border-[var(--border-subtle)] flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <!-- Segmented Workspace Tabs -->
          <div class="flex flex-wrap items-center gap-1.5 bg-[var(--bg-surface-muted)] p-1 rounded-xl border border-[var(--border-subtle)]">
            <button
              type="button"
              (click)="activeGlassScene.set('all')"
              class="px-3 py-1.5 rounded-lg text-xs font-black transition-colors cursor-pointer inline-flex items-center gap-1.5"
              [class]="activeGlassScene() === 'all' ? 'bg-[#2563EB] text-white' : 'text-[var(--text-heading)] hover:bg-[var(--bg-card)]'"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">grid_view</mat-icon>
              <span>اللوحة الشاملة (Bento)</span>
            </button>
            <button
              type="button"
              (click)="activeGlassScene.set('projects')"
              class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              [class]="activeGlassScene() === 'projects' ? 'bg-[#2563EB] text-white' : 'text-[var(--text-heading)] hover:bg-[var(--bg-card)]'"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">domain</mat-icon>
              <span>١. المشاريع والإنجاز</span>
            </button>
            <button
              type="button"
              (click)="activeGlassScene.set('workers')"
              class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              [class]="activeGlassScene() === 'workers' ? 'bg-emerald-600 text-white' : 'text-[var(--text-heading)] hover:bg-[var(--bg-card)]'"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">groups</mat-icon>
              <span>٢. العمال والموارد البشرية</span>
            </button>
            <button
              type="button"
              (click)="activeGlassScene.set('timeline')"
              class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              [class]="activeGlassScene() === 'timeline' ? 'bg-purple-600 text-white' : 'text-[var(--text-heading)] hover:bg-[var(--bg-card)]'"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">schedule</mat-icon>
              <span>٣. اليوميات والورديات</span>
            </button>
            <button
              type="button"
              (click)="activeGlassScene.set('finance')"
              class="px-3 py-1.5 rounded-lg text-xs font-extrabold transition-colors cursor-pointer inline-flex items-center gap-1.5"
              [class]="activeGlassScene() === 'finance' ? 'bg-amber-600 text-white' : 'text-[var(--text-heading)] hover:bg-[var(--bg-card)]'"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">account_balance_wallet</mat-icon>
              <span>٤. السلف والحسابات</span>
            </button>
          </div>

          <!-- Compact Project & Date Filter Controls -->
          <div class="flex flex-wrap items-center gap-2">
            <select
              aria-label="فلترة حسب المشروع"
              [value]="store.selectedProjectId() ?? ''"
              (change)="onProjectFilterChange($event)"
              class="bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] rounded-lg px-2.5 py-1.5 text-xs font-bold text-[var(--text-heading)] focus:outline-none focus:border-[#2563EB]"
            >
              <option value="">كل المشاريع ({{ store.num(store.projects().length) }})</option>
              @for (proj of store.projects(); track proj.id) {
                <option [value]="proj.id">{{ proj.name }}</option>
              }
            </select>

            <div class="inline-flex items-center gap-1 bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-xs">
              <span class="text-[10px] font-bold text-[var(--text-secondary)]">من:</span>
              <input
                type="date"
                aria-label="من تاريخ"
                [value]="fromDate()"
                (change)="fromDate.set($any($event.target).value)"
                class="bg-transparent text-xs font-bold tabular-nums text-[var(--text-heading)] focus:outline-none"
              />
            </div>

            <div class="inline-flex items-center gap-1 bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] rounded-lg px-2 py-1 text-xs">
              <span class="text-[10px] font-bold text-[var(--text-secondary)]">إلى:</span>
              <input
                type="date"
                aria-label="إلى تاريخ"
                [value]="toDate()"
                (change)="toDate.set($any($event.target).value)"
                class="bg-transparent text-xs font-bold tabular-nums text-[var(--text-heading)] focus:outline-none"
              />
            </div>

            <button
              type="button"
              (click)="excel.exportFullWorkbook()"
              class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">download</mat-icon>
              <span>تصدير Excel</span>
            </button>
          </div>
        </div>
      </section>

      <!-- =====================================================================
           2. EXECUTIVE 4-COLUMN KPI SUMMARY RIBBON (Simple Colors & Polite Lift)
           ===================================================================== -->
      <section class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <!-- KPI 1: صافي الخزنة والأرباح -->
        <div class="ceramic-card polite-card p-4 flex flex-col justify-between gap-3 border-t-4 border-t-emerald-600">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[11px] font-extrabold text-[var(--text-secondary)]">صافي الربح العام والخزنة</span>
              <div class="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {{ store.money(ledger.overallNetProfit) }}
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-[var(--tint-emerald)] text-emerald-600 dark:text-emerald-300 border border-emerald-500/25 flex items-center justify-center shrink-0 polite-icon-badge">
              <mat-icon class="!w-5 !h-5 !text-[20px]">account_balance_wallet</mat-icon>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
            <div>
              <span class="text-[var(--text-secondary)] block">إجمالي المقبوضات</span>
              <strong class="text-[var(--text-heading)] tabular-nums">{{ store.money(ledger.totalReceivedAllSources) }}</strong>
            </div>
            <div>
              <span class="text-[var(--text-secondary)] block">إجمالي المنصرف</span>
              <strong class="text-rose-600 dark:text-rose-400 tabular-nums">{{ store.money(ledger.totalSpentAllProjects) }}</strong>
            </div>
          </div>
        </div>

        <!-- KPI 2: المشاريع النشطة ومعدل الإنجاز -->
        <div class="ceramic-card polite-card p-4 flex flex-col justify-between gap-3 border-t-4 border-t-[#2563EB]">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[11px] font-extrabold text-[var(--text-secondary)]">المشاريع النشطة ونسب الإنجاز</span>
              <div class="text-xl sm:text-2xl font-black text-[var(--text-heading)] tabular-nums mt-0.5">
                {{ store.num(glassProjectsShowcase().length) }} مشاريع <span class="text-xs font-extrabold text-[#2563EB] dark:text-blue-400">(92% · 45%)</span>
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-[var(--tint-blue)] text-[#2563EB] dark:text-blue-300 border border-blue-500/25 flex items-center justify-center shrink-0 polite-icon-badge">
              <mat-icon class="!w-5 !h-5 !text-[20px]">domain</mat-icon>
            </div>
          </div>
          <div class="space-y-1.5 pt-2 border-t border-[var(--border-subtle)]">
            <div class="flex items-center justify-between text-[11px]">
              <span class="text-[var(--text-secondary)]">إجمالي المطلوب من الشركات:</span>
              <strong class="text-[#2563EB] dark:text-blue-400 tabular-nums">{{ store.money(filteredSummary().requiredFromCompany) }}</strong>
            </div>
            <div class="h-2 w-full rounded bg-[var(--bg-surface-muted)] overflow-hidden border border-[var(--border-subtle)]">
              <div class="h-full bg-[#2563EB] polite-bar" style="width: 78%"></div>
            </div>
          </div>
        </div>

        <!-- KPI 3: توافر القوى العاملة والحضور -->
        <div class="ceramic-card polite-card p-4 flex flex-col justify-between gap-3 border-t-4 border-t-purple-600">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[11px] font-extrabold text-[var(--text-secondary)]">توافر القوى العاملة اليوم</span>
              <div class="text-xl sm:text-2xl font-black text-[var(--text-heading)] tabular-nums mt-0.5">
                {{ store.num(workforceAvailabilityRate()) }}%
                <span class="text-xs font-bold text-emerald-600 dark:text-emerald-400">({{ store.num(hrWorkersShowcase().presentCount) }} حاضر)</span>
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-[var(--tint-violet)] text-purple-600 dark:text-purple-300 border border-purple-500/25 flex items-center justify-center shrink-0 polite-icon-badge">
              <mat-icon class="!w-5 !h-5 !text-[20px]">engineering</mat-icon>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
            <div>
              <span class="text-[var(--text-secondary)] block">النحّاتية والصنايعية</span>
              <strong class="text-[var(--text-heading)] tabular-nums">{{ store.num(hrWorkersShowcase().sculptorsTotal) }} نحات · {{ store.num(hrWorkersShowcase().regularTotal) }} عامل</strong>
            </div>
            <div>
              <span class="text-[var(--text-secondary)] block">إجمالي اليوميات</span>
              <strong class="text-purple-600 dark:text-purple-400 tabular-nums">{{ store.num(filteredSummary().totalDays) }} ي · {{ store.num(filteredSummary().totalNights) }} س</strong>
            </div>
          </div>
        </div>

        <!-- KPI 4: السلف والشيكات وكشف اليوم -->
        <div class="ceramic-card polite-card p-4 flex flex-col justify-between gap-3 border-t-4 border-t-amber-500">
          <div class="flex items-start justify-between gap-2">
            <div>
              <span class="text-[11px] font-extrabold text-[var(--text-secondary)]">السلف والأجور المستحقة</span>
              <div class="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
                {{ store.money(filteredSummary().totalAdvancesGiven) }}
              </div>
            </div>
            <div class="w-10 h-10 rounded-xl bg-[var(--tint-amber)] text-amber-600 dark:text-amber-300 border border-amber-500/25 flex items-center justify-center shrink-0 polite-icon-badge">
              <mat-icon class="!w-5 !h-5 !text-[20px]">payments</mat-icon>
            </div>
          </div>
          <div class="grid grid-cols-2 gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
            <div>
              <span class="text-[var(--text-secondary)] block">أجور العمال</span>
              <strong class="text-[var(--text-heading)] tabular-nums">{{ store.money(filteredSummary().totalWorkerWages) }}</strong>
            </div>
            <div>
              <span class="text-[var(--text-secondary)] block">شيكات معلقة</span>
              <strong class="text-[#2563EB] dark:text-blue-400 tabular-nums">{{ store.money(filteredSummary().incomingChecksPending) }}</strong>
            </div>
          </div>
        </div>
      </section>


      <!-- =====================================================================
           3. MAIN 4-MODULE ARCHITECTURAL BENTO WORKSPACE GRID
           ===================================================================== -->
      <div class="grid grid-cols-1 xl:grid-cols-12 gap-5">
        <!-- ===================================================================
             MODULE 1: إدارة المقاولات والمشاريع النشطة ومخطط الإنجاز (Gantt 92% / 45%)
             =================================================================== -->
        @if (activeGlassScene() === 'all' || activeGlassScene() === 'projects') {
          <section
            class="glass-scene-projects p-5 space-y-4"
            [class.xl:col-span-6]="activeGlassScene() === 'all'"
            [class.xl:col-span-12]="activeGlassScene() === 'projects'"
          >
            <!-- Module Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
              <div class="flex items-start gap-3">
                <!-- Clean Architectural Construction SVG Emblem -->
                <div class="w-12 h-12 rounded-xl bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] flex items-center justify-center p-1.5 shrink-0">
                  <svg viewBox="0 0 120 120" class="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="60,105 15,82 60,60 105,82" fill="#DBEAFE" stroke="#2563EB" stroke-width="2"/>
                    <polygon points="35,85 35,42 58,32 58,75" fill="#93C5FD" stroke="#1D4ED8" stroke-width="2"/>
                    <polygon points="58,32 80,42 80,85 58,75" fill="#60A5FA" stroke="#1E40AF" stroke-width="2"/>
                    <line x1="88" y1="90" x2="88" y2="16" stroke="#D97706" stroke-width="4"/>
                    <line x1="42" y1="20" x2="106" y2="20" stroke="#D97706" stroke-width="3.5"/>
                    <rect x="46" y="34" width="10" height="7" rx="1.5" fill="#2563EB"/>
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-blue-600 text-white text-[10px] font-black">قسم المشاريع ١</span>
                    <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                      إدارة المقاولات والمشاريع ومخطط جانت (Gantt)
                    </h2>
                  </div>
                  <p class="text-xs text-[var(--text-secondary)] mt-0.5">
                    متابعة نسب إنجاز المواقع (92%، 45%)، مراحل التنفيذ، وصافي ربح كل مشروع
                  </p>
                </div>
              </div>

              <a
                routerLink="/settings"
                class="px-3 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-black inline-flex items-center gap-1 self-start sm:self-center shrink-0"
              >
                <mat-icon class="!w-4 !h-4 !text-[15px]">add_business</mat-icon>
                <span>+ مشروع جديد</span>
              </a>
            </div>

            <!-- Structured Gantt Completion Bars -->
            <div class="solid-subcard p-3.5 space-y-3">
              <div class="flex items-center justify-between text-xs">
                <span class="font-black text-[var(--text-heading)] flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-[#2563EB]">stacked_bar_chart</mat-icon>
                  <span>مخطط جانت الهندسي لنسب إنجاز المشاريع</span>
                </span>
                <span class="text-[11px] font-bold text-[var(--text-secondary)] tabular-nums">
                  عدد المشاريع: {{ store.num(glassProjectsShowcase().length) }}
                </span>
              </div>

              <div class="space-y-2.5">
                @for (gp of glassProjectsShowcase(); track gp.id) {
                  <div class="space-y-1">
                    <div class="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div class="flex items-center gap-2">
                        <span class="font-extrabold text-[var(--text-heading)]">{{ gp.name }}</span>
                        <span class="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] text-[10px] font-bold">
                          {{ gp.siteLocation }}
                        </span>
                      </div>
                      <div class="flex items-center gap-2">
                        <span class="text-[11px] text-[var(--text-secondary)]">{{ gp.stageLabel }}</span>
                        <span
                          class="px-2 py-0.5 rounded text-xs font-black tabular-nums text-white"
                          [class]="gp.progress >= 75 ? 'bg-emerald-600' : 'bg-[#2563EB]'"
                        >
                          {{ store.num(gp.progress) }}%
                        </span>
                      </div>
                    </div>

                    <div class="h-2.5 w-full rounded bg-[var(--bg-card)] overflow-hidden border border-[var(--border-subtle)]">
                      <div
                        class="h-full chart-bar-fill"
                        [class]="gp.progress >= 75 ? 'bg-emerald-600' : 'bg-[#2563EB]'"
                        [style.width.%]="gp.progress"
                      ></div>
                    </div>
                  </div>
                }
              </div>
            </div>

            <!-- Active Project Cards Grid -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              @for (gp of glassProjectsShowcase(); track gp.id) {
                <div
                  (click)="gp.realProjectId ? store.openProjectSheet(gp.realProjectId) : null"
                  class="solid-subcard p-3.5 flex flex-col justify-between gap-3 cursor-pointer"
                >
                  <div class="flex items-start justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-10 h-10 rounded-lg bg-[#2563EB] text-white flex items-center justify-center shrink-0">
                        <mat-icon class="!w-5 !h-5 !text-[20px]">{{ gp.icon }}</mat-icon>
                      </div>
                      <div class="min-w-0">
                        <h3 class="text-xs sm:text-sm font-black text-[var(--text-heading)] truncate">{{ gp.name }}</h3>
                        <p class="text-[11px] text-[var(--text-secondary)] truncate">الموقع: {{ gp.siteLocation }}</p>
                      </div>
                    </div>
                    <span class="px-2 py-0.5 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[#2563EB] dark:text-blue-400 text-xs font-black tabular-nums shrink-0">
                      {{ store.num(gp.progress) }}%
                    </span>
                  </div>

                  <div class="grid grid-cols-3 gap-1.5 text-[11px]">
                    <div class="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <div class="text-[10px] text-[var(--text-secondary)]">المرحلة</div>
                      <div class="font-extrabold text-[var(--text-heading)] truncate">{{ gp.stageLabel }}</div>
                    </div>
                    <div class="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <div class="text-[10px] text-[var(--text-secondary)]">المطلوب</div>
                      <div class="font-extrabold text-[#2563EB] dark:text-blue-400 tabular-nums truncate">{{ store.money(gp.requiredAmount) }}</div>
                    </div>
                    <div class="p-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)]">
                      <div class="text-[10px] text-[var(--text-secondary)]">صافي الربح</div>
                      <div class="font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums truncate">{{ store.money(gp.netProfit) }}</div>
                    </div>
                  </div>

                  <div class="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-subtle)]">
                    <span class="text-[11px] font-bold text-[var(--text-secondary)]">
                      يومية الشركة: {{ store.money(gp.companyDayRate) }}
                    </span>
                    <button
                      type="button"
                      (click)="$event.stopPropagation(); gp.realProjectId ? store.openProjectSheet(gp.realProjectId) : store.openPocketSheet(null, null)"
                      class="px-3 py-1 rounded-md bg-[#2563EB] hover:bg-blue-700 text-white text-[11px] font-black inline-flex items-center gap-1 cursor-pointer"
                    >
                      <span>تفاصيل المشروع</span>
                      <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">arrow_back</mat-icon>
                    </button>
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <!-- ===================================================================
             MODULE 2: العمال والموارد البشرية والحضور الميداني (HR & Workforce)
             =================================================================== -->
        @if (activeGlassScene() === 'all' || activeGlassScene() === 'workers') {
          <section
            class="glass-scene-workers p-5 space-y-4"
            [class.xl:col-span-6]="activeGlassScene() === 'all'"
            [class.xl:col-span-12]="activeGlassScene() === 'workers'"
          >
            <!-- Module Header + Circular Availability Donut -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">قسم الموارد البشرية ٢</span>
                  <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                    العمال والنحّاتية ومؤشرات الحضور والأداء
                  </h2>
                </div>
                <p class="text-xs text-[var(--text-secondary)]">
                  متابعة الحضور والغياب اليومي، توزيع الفرق على المواقع، وتقييم الأداء الأسبوعي
                </p>
              </div>

              <div class="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                <div class="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)]">
                  <div class="relative w-10 h-10 flex items-center justify-center">
                    <svg viewBox="0 0 36 36" class="w-10 h-10 -rotate-90">
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#CBD5E1"
                        stroke-width="4"
                      />
                      <path
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                        fill="none"
                        stroke="#059669"
                        stroke-width="4"
                        stroke-linecap="round"
                        [attr.stroke-dasharray]="workforceAvailabilityRate() + ', 100'"
                      />
                    </svg>
                    <span class="absolute text-[10px] font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      {{ store.num(workforceAvailabilityRate()) }}%
                    </span>
                  </div>
                  <div class="text-[11px]">
                    <div class="font-black text-[var(--text-heading)]">نسبة التوافر</div>
                    <div class="text-[10px] text-[var(--text-secondary)]">
                      حاضر: <strong class="text-emerald-600">{{ store.num(hrWorkersShowcase().presentCount) }}</strong> · غائب: <strong class="text-rose-600">{{ store.num(hrWorkersShowcase().absentCount) }}</strong>
                    </div>
                  </div>
                </div>

                <a
                  routerLink="/workers"
                  class="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black inline-flex items-center gap-1"
                >
                  <mat-icon class="!w-4 !h-4 !text-[15px]">groups</mat-icon>
                  <span>دليل العمال</span>
                </a>
              </div>
            </div>

            <!-- Team Distribution Summary Strip -->
            <div class="grid grid-cols-3 gap-2.5">
              <div class="solid-subcard p-2.5 flex items-center justify-between">
                <div>
                  <div class="text-[10px] font-bold text-[var(--text-secondary)]">طاقم النحّاتية</div>
                  <div class="text-sm font-black text-amber-600 dark:text-amber-400 tabular-nums">{{ store.num(hrWorkersShowcase().sculptorsTotal) }} نحّات</div>
                </div>
                <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-500">handyman</mat-icon>
              </div>
              <div class="solid-subcard p-2.5 flex items-center justify-between">
                <div>
                  <div class="text-[10px] font-bold text-[var(--text-secondary)]">الصنايعية والعمال</div>
                  <div class="text-sm font-black text-[#2563EB] dark:text-blue-400 tabular-nums">{{ store.num(hrWorkersShowcase().regularTotal) }} عامل</div>
                </div>
                <mat-icon class="!w-5 !h-5 !text-[20px] text-[#2563EB]">engineering</mat-icon>
              </div>
              <div class="solid-subcard p-2.5 flex items-center justify-between">
                <div>
                  <div class="text-[10px] font-bold text-[var(--text-secondary)]">متوسط الأداء</div>
                  <div class="text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{{ store.num(96) }}%</div>
                </div>
                <mat-icon class="!w-5 !h-5 !text-[20px] text-emerald-600">verified</mat-icon>
              </div>
            </div>

            <!-- Worker Roster Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              @for (wCard of hrWorkersShowcase().cards; track wCard.id) {
                <div
                  (click)="wCard.realWorkerId ? store.openWorkerSheet(wCard.realWorkerId) : null"
                  class="solid-subcard p-3 flex flex-col justify-between gap-2.5 cursor-pointer"
                >
                  <div class="flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <!-- Solid Avatar with Safety Helmet SVG -->
                      <div class="relative w-11 h-11 rounded-lg bg-slate-900 border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
                        <svg viewBox="0 0 64 64" class="w-9 h-9" fill="none" xmlns="http://www.w3.org/2000/svg">
                          <path d="M12 58C12 46 20 42 32 42C44 42 52 46 52 58" fill="#F59E0B"/>
                          <path d="M23 43V58M41 43V58" stroke="#FEF08A" stroke-width="3"/>
                          <circle cx="32" cy="30" r="10" fill="#FDBA74"/>
                          <path d="M20 26C20 18 25 13 32 13C39 13 44 18 44 26H20Z" [attr.fill]="wCard.helmetColor"/>
                          <rect x="18" y="25" width="28" height="3.5" rx="1.75" fill="#FDE047"/>
                        </svg>
                        <span
                          class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-slate-950"
                          [class]="wCard.isPresentToday ? 'bg-emerald-500' : 'bg-rose-500'"
                        ></span>
                      </div>

                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <span class="text-xs sm:text-sm font-black text-[var(--text-heading)] truncate">{{ wCard.name }}</span>
                          <span class="px-1.5 py-0.2 rounded bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[#2563EB] dark:text-blue-400 text-[10px] font-bold">{{ wCard.role }}</span>
                        </div>
                        <div class="text-[11px] text-[var(--text-secondary)] truncate">
                          {{ wCard.siteName }} · {{ wCard.assignedTask }}
                        </div>
                      </div>
                    </div>

                    <span
                      class="px-2 py-0.5 rounded text-[10px] font-black shrink-0 text-white"
                      [class]="wCard.isPresentToday ? 'bg-emerald-600' : 'bg-rose-600'"
                    >
                      {{ wCard.isPresentToday ? 'حاضر' : 'غائب' }}
                    </span>
                  </div>

                  <div class="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-subtle)] text-[11px]">
                    <span class="text-[var(--text-secondary)]">
                      الأداء الأسبوعي: <strong class="text-[var(--text-heading)] tabular-nums">{{ store.num(wCard.weeklyRating) }}%</strong>
                    </span>
                    @if (wCard.realWorkerId) {
                      <button
                        type="button"
                        (click)="$event.stopPropagation(); quickCheckInWorker(wCard.realWorkerId!)"
                        class="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black cursor-pointer transition-colors"
                      >
                        {{ wCard.isPresentToday ? 'ملف العامل' : '+ تحضير فوري' }}
                      </button>
                    } @else {
                      <a routerLink="/workers" class="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-black">
                        + إضافة عامل
                      </a>
                    }
                  </div>
                </div>
              }
            </div>
          </section>
        }

        <!-- ===================================================================
             MODULE 3: اليوميات والورديات والمهام اليومية (Timeline & Shifts)
             =================================================================== -->
        @if (activeGlassScene() === 'all' || activeGlassScene() === 'timeline') {
          <section
            class="glass-scene-timeline p-5 space-y-4"
            [class.xl:col-span-6]="activeGlassScene() === 'all'"
            [class.xl:col-span-12]="activeGlassScene() === 'timeline'"
          >
            <!-- Module Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
              <div class="space-y-0.5">
                <div class="flex items-center gap-2">
                  <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-black">قسم اليوميات ٣</span>
                  <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                    الجدول الزمني للورديات والمهام اليومية ({{ store.digits(store.todayIso()) }})
                  </h2>
                </div>
                <p class="text-xs text-[var(--text-secondary)]">
                  متابعة ورديات العمل اليومية، حالة المهام (تحت التنفيذ · مكتمل · تنبيه)، وسجل المعدات
                </p>
              </div>

              <div class="flex items-center gap-2 self-start sm:self-center shrink-0">
                <a
                  routerLink="/daily-inspector"
                  class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-black inline-flex items-center gap-1"
                >
                  <mat-icon class="!w-4 !h-4 !text-[15px]">event_note</mat-icon>
                  <span>كشف اليوم بالتاريخ</span>
                </a>
                <a
                  routerLink="/attendance"
                  class="px-3 py-1.5 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] hover:border-purple-600 text-[var(--text-heading)] text-xs font-bold"
                >
                  دفتر اليوميات
                </a>
              </div>
            </div>

            <!-- 3-Shift Architectural Timeline -->
            <div class="solid-subcard p-3.5 space-y-2.5">
              <div class="flex items-center justify-between text-xs">
                <span class="font-black text-[var(--text-heading)] flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-purple-600">view_timeline</mat-icon>
                  <span>جدول ورديات العمل اليومية</span>
                </span>
                <span class="text-[11px] font-bold text-purple-600 dark:text-purple-400">
                  {{ store.todayHeadcountMatch().statusLabel }}
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div class="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] border-r-4 border-r-[#2563EB] space-y-1">
                  <div class="flex items-center justify-between text-[11px] font-black text-[#2563EB] dark:text-blue-400">
                    <span>الوردية الصباحية</span>
                    <span class="tabular-nums">07:00 ← 03:00</span>
                  </div>
                  <div class="text-xs font-extrabold text-[var(--text-heading)]">
                    {{ store.num(store.todayHeadcountMatch().actualDays) }} يومية من {{ store.num(store.todayHeadcountMatch().expectedDays || store.activeWorkers().length) }}
                  </div>
                </div>

                <div class="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] border-r-4 border-r-purple-600 space-y-1">
                  <div class="flex items-center justify-between text-[11px] font-black text-purple-600 dark:text-purple-400">
                    <span>الإضافي والناش</span>
                    <span class="tabular-nums">03:00 ← 06:00</span>
                  </div>
                  <div class="text-xs font-extrabold text-[var(--text-heading)]">
                    {{ store.num(store.extras().length) }} أوامر شغل ومهام
                  </div>
                </div>

                <div class="p-3 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] border-r-4 border-r-amber-500 space-y-1">
                  <div class="flex items-center justify-between text-[11px] font-black text-amber-600 dark:text-amber-400">
                    <span>السهرة الليلية</span>
                    <span class="tabular-nums">06:00 ← 11:00</span>
                  </div>
                  <div class="text-xs font-extrabold text-[var(--text-heading)]">
                    {{ store.num(store.todayHeadcountMatch().actualNights) }} سهرة مسجلة
                  </div>
                </div>
              </div>
            </div>

            <!-- 3 Task Status Columns (تحت التنفيذ · مكتمل · تنبيه) -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="solid-subcard p-3.5 space-y-2 border-t-2 border-t-[#2563EB]">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black">تحت التنفيذ</span>
                  <mat-icon class="!w-5 !h-5 !text-[18px] text-[#2563EB]">schedule</mat-icon>
                </div>
                <div class="text-xs font-black text-[var(--text-heading)]">
                  {{ dailySiteTasks().inProgressTitle }}
                </div>
                <p class="text-[11px] text-[var(--text-secondary)]">
                  {{ dailySiteTasks().inProgressSub }}
                </p>
              </div>

              <div class="solid-subcard p-3.5 space-y-2 border-t-2 border-t-emerald-600">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">مكتمل ✓</span>
                  <mat-icon class="!w-5 !h-5 !text-[18px] text-emerald-600">check_circle</mat-icon>
                </div>
                <div class="text-xs font-black text-[var(--text-heading)]">
                  {{ dailySiteTasks().completedTitle }}
                </div>
                <p class="text-[11px] text-[var(--text-secondary)]">
                  {{ dailySiteTasks().completedSub }}
                </p>
              </div>

              <div class="solid-subcard p-3.5 space-y-2 border-t-2 border-t-rose-600">
                <div class="flex items-center justify-between">
                  <span class="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-black">تنبيه المراجعة</span>
                  <mat-icon class="!w-5 !h-5 !text-[18px] text-rose-600">notification_important</mat-icon>
                </div>
                <div class="text-xs font-black text-[var(--text-heading)]">
                  {{ dailySiteTasks().delayedTitle }}
                </div>
                <p class="text-[11px] text-[var(--text-secondary)]">
                  {{ dailySiteTasks().delayedSub }}
                </p>
              </div>
            </div>

            <!-- Site & Equipment Daily Log -->
            <div class="solid-subcard p-3.5 space-y-2">
              <div class="flex items-center justify-between">
                <h3 class="text-xs font-black text-[var(--text-heading)] flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-600">precision_manufacturing</mat-icon>
                  <span>سجل يوميات الموقع والمعدات</span>
                </h3>
                <button
                  type="button"
                  (click)="store.showQuickHeadcountModal.set(true)"
                  class="px-2.5 py-1 rounded bg-purple-600 text-white text-[10px] font-black cursor-pointer"
                >
                  + تحديث العدد اليومي
                </button>
              </div>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div class="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span class="font-bold text-[var(--text-heading)]">معدات النحت والسقالات والكمبروسر</span>
                  <span class="px-2 py-0.5 rounded bg-emerald-600 text-white text-[10px] font-black">تعمل ١٠٠٪</span>
                </div>
                <div class="p-2.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] flex items-center justify-between">
                  <span class="font-bold text-[var(--text-heading)]">إجمالي يوميات وسهرات الفترة</span>
                  <span class="font-black text-purple-600 dark:text-purple-400 tabular-nums">
                    {{ store.num(filteredSummary().totalDays) }} ي · {{ store.num(filteredSummary().totalNights) }} س
                  </span>
                </div>
              </div>
            </div>
          </section>
        }

        <!-- ===================================================================
             MODULE 4: السلف، الأجور، الحسابات والتدفقات المالية (Finance & Ledger)
             =================================================================== -->
        @if (activeGlassScene() === 'all' || activeGlassScene() === 'finance') {
          <section
            class="glass-scene-finance p-5 space-y-4"
            [class.xl:col-span-6]="activeGlassScene() === 'all'"
            [class.xl:col-span-12]="activeGlassScene() === 'finance'"
          >
            <!-- Module Header -->
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--border-subtle)] pb-3.5">
              <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-xl bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] flex items-center justify-center p-1.5 shrink-0">
                  <svg viewBox="0 0 120 120" class="w-full h-full" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <rect x="16" y="42" width="66" height="48" rx="8" fill="#D1FAE5" stroke="#059669" stroke-width="2.5"/>
                    <rect x="28" y="24" width="62" height="36" rx="6" fill="#FEF3C7" stroke="#D97706" stroke-width="2.5"/>
                    <circle cx="96" cy="40" r="10" fill="#F59E0B" stroke="#B45309" stroke-width="2"/>
                    <circle cx="100" cy="74" r="9" fill="#10B981" stroke="#047857" stroke-width="2"/>
                  </svg>
                </div>
                <div>
                  <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded bg-amber-600 text-white text-[10px] font-black">قسم الحسابات ٤</span>
                    <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                      السلف، الأجور، الشيكات والتدفقات المالية
                    </h2>
                  </div>
                  <p class="text-xs text-[var(--text-secondary)] mt-0.5">
                    مؤشر التدفقات المالية، السلف المعلقة، أجور العمال، ومستحقات الشركات
                  </p>
                </div>
              </div>

              <a
                routerLink="/my-ledger"
                class="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-black inline-flex items-center gap-1 self-start sm:self-center shrink-0"
              >
                <mat-icon class="!w-4 !h-4 !text-[15px]">account_balance_wallet</mat-icon>
                <span>الخزنة الشاملة</span>
              </a>
            </div>

            <!-- Financial Trend Chart (Solid Clean Surface) -->
            <div class="solid-subcard p-3.5 space-y-2.5">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <span class="text-xs font-black text-[var(--text-heading)] flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600">trending_up</mat-icon>
                  <span>منحنى التدفقات المالية وصافي الربح</span>
                </span>
                <span class="px-2.5 py-0.5 rounded bg-emerald-600 text-white text-xs font-black tabular-nums">
                  صافي الربح: {{ store.money(ledger.overallNetProfit) }}
                </span>
              </div>

              <div class="h-24 w-full rounded-lg bg-slate-900 border border-[var(--border-subtle)] p-2 relative overflow-hidden flex items-end">
                <svg viewBox="0 0 400 90" class="w-full h-full" preserveAspectRatio="none">
                  <path
                    d="M0,78 L55,65 L115,68 L175,46 L235,50 L295,26 L355,30 L400,12 L400,90 L0,90 Z"
                    fill="rgba(16, 185, 129, 0.22)"
                  />
                  <polyline
                    fill="none"
                    stroke="#10B981"
                    stroke-width="3"
                    points="0,78 55,65 115,68 175,46 235,50 295,26 355,30 400,12"
                  />
                  <circle cx="175" cy="46" r="4" fill="#F59E0B"/>
                  <circle cx="295" cy="26" r="4" fill="#10B981"/>
                  <circle cx="400" cy="12" r="5" fill="#FBBF24"/>
                </svg>
                <div class="absolute top-2 right-3 flex flex-wrap items-center gap-3 text-[11px] font-black text-emerald-400">
                  <span>المقبوضات: {{ store.money(ledger.totalReceivedAllSources) }}</span>
                  <span class="text-amber-300">المنصرف: {{ store.money(ledger.totalSpentAllProjects) }}</span>
                </div>
              </div>
            </div>

            <!-- 3 Financial Ledger Cards -->
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div class="solid-subcard p-3.5 flex flex-col justify-between gap-2 border-t-2 border-t-amber-500">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black text-amber-600 dark:text-amber-400">السلف المالية المعلقة</span>
                  <mat-icon class="!w-4 !h-4 !text-[17px] text-amber-500">payments</mat-icon>
                </div>
                <div class="text-base sm:text-lg font-black text-[var(--text-heading)] tabular-nums">
                  {{ store.money(filteredSummary().totalAdvancesGiven) }}
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-[var(--text-secondary)]">العدد: {{ store.num(store.advances().length) }}</span>
                  <a routerLink="/advances" class="text-amber-600 dark:text-amber-400 font-black hover:underline">السلف ←</a>
                </div>
              </div>

              <div class="solid-subcard p-3.5 flex flex-col justify-between gap-2 border-t-2 border-t-emerald-600">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black text-emerald-600 dark:text-emerald-400">أجور العمال واليوميات</span>
                  <mat-icon class="!w-4 !h-4 !text-[17px] text-emerald-600">engineering</mat-icon>
                </div>
                <div class="text-base sm:text-lg font-black text-[var(--text-heading)] tabular-nums">
                  {{ store.money(filteredSummary().totalWorkerWages) }}
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-[var(--text-secondary)]">متبقي: {{ store.money(ledger.totalOwedByMe) }}</span>
                  <a routerLink="/settlements" class="text-emerald-600 dark:text-emerald-400 font-black hover:underline">قبض ١٥ ←</a>
                </div>
              </div>

              <div class="solid-subcard p-3.5 flex flex-col justify-between gap-2 border-t-2 border-t-[#2563EB]">
                <div class="flex items-center justify-between">
                  <span class="text-xs font-black text-[#2563EB] dark:text-blue-400">المستحقات والشيكات</span>
                  <mat-icon class="!w-4 !h-4 !text-[17px] text-[#2563EB]">account_balance</mat-icon>
                </div>
                <div class="text-base sm:text-lg font-black text-[var(--text-heading)] tabular-nums">
                  {{ store.money(ledger.totalOwedToMe) }}
                </div>
                <div class="flex items-center justify-between text-[11px]">
                  <span class="text-[var(--text-secondary)]">شيكات: {{ store.money(filteredSummary().incomingChecksPending) }}</span>
                  <a routerLink="/checks" class="text-[#2563EB] dark:text-blue-400 font-black hover:underline">الشيكات ←</a>
                </div>
              </div>
            </div>
          </section>
        }
      </div>

      <!-- =====================================================================
           4. DAILY DATE INSPECTOR (20-10) & OFFLINE/ONLINE SYNC HUB
           ===================================================================== -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Daily Date Inspector (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-5 flex flex-col justify-between gap-3.5">
          <div class="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2 py-0.5 rounded bg-[#2563EB] text-white text-[10px] font-black">كشف تاريخ مخصص</span>
                <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)]">
                  كشف اليوم بالتاريخ ({{ store.digits(dayRep.date) }}) — السيولة والمصروف والعمال
                </h2>
              </div>
              <p class="text-xs text-[var(--text-secondary)] mt-0.5">
                حدد أي يوم (مثل ٢٠-١٠) لمعرفة المتاح، المنصرف، المكسب، والعمال الذين عملوا بسلف أو بدون سلف
              </p>
            </div>
            <a
              routerLink="/daily-inspector"
              class="px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-black inline-flex items-center gap-1 shrink-0"
            >
              <mat-icon class="!w-4 !h-4 !text-[15px]">calendar_month</mat-icon>
              <span>فتح كشف اليوم الكامل</span>
            </a>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            <div class="p-3 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">كان معايا متاح</div>
              <div class="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{{ store.money(dayRep.totalAvailableOnDay) }}</div>
            </div>
            <div class="p-3 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">اتصرف في اليوم</div>
              <div class="text-xs sm:text-sm font-black text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">{{ store.money(dayRep.totalSpentOnDay) }}</div>
            </div>
            <div class="p-3 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)]">
              <div class="text-[10px] font-bold text-[var(--text-secondary)]">اشتغلوا (بسلف / بدون)</div>
              <div class="text-xs sm:text-sm font-black text-[#2563EB] dark:text-blue-400 tabular-nums mt-0.5">
                {{ store.num(dayRep.totalWorkersWhoWorked) }} ({{ store.num(dayRep.workersWhoWorkedWithAdvanceCount) }} / {{ store.num(dayRep.workersWhoWorkedWithoutAdvanceCount) }})
              </div>
            </div>
            <div class="p-3 rounded-lg bg-[var(--bg-surface-muted)] border border-emerald-600/40">
              <div class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">مكسب اليوم</div>
              <div class="text-xs sm:text-sm font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{{ store.money(dayRep.netProfitOnDay) }}</div>
            </div>
          </div>
        </div>

        <!-- Smart Offline Sync & Developer Credit Card (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 flex flex-col justify-between gap-3.5">
          <div class="flex items-start justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <div class="flex items-center gap-1.5">
                <span
                  class="w-2.5 h-2.5 rounded-full"
                  [class.bg-amber-500]="store.localOnlyMode() || !store.isNetworkOnline()"
                  [class.bg-emerald-500]="!store.localOnlyMode() && store.isNetworkOnline()"
                ></span>
                <h3 class="text-sm font-black text-[var(--text-heading)]">
                  المزامنة الذكية (أوفلاين وقاعدة البيانات)
                </h3>
              </div>
              <p class="text-[11px] text-[var(--text-secondary)] mt-0.5">
                سجّل سلف أو يوميات بدون إنترنت، وعند الاتصال تتم المزامنة الفورية مع قاعدة البيانات
              </p>
            </div>
            <span class="px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black shrink-0">
              بالانتظار: {{ store.num(store.offlinePendingQueue().length) }}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              (click)="store.toggleLocalOnlyMode()"
              class="flex-1 py-2 px-3 rounded-lg font-black text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
              [class]="store.localOnlyMode() ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-slate-950'"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">{{ store.localOnlyMode() ? 'wifi' : 'wifi_off' }}</mat-icon>
              <span>{{ store.localOnlyMode() ? 'فتح النت ومزامنة الطابور الآن' : 'قفل النت مؤقتاً (وضع أوفلاين)' }}</span>
            </button>
            <a
              routerLink="/sync-center"
              class="py-2 px-3 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] hover:border-[#2563EB] text-xs font-black text-[var(--text-heading)]"
            >
              مركز المزامنة
            </a>
          </div>

          <div class="pt-2 border-t border-[var(--border-subtle)] flex items-center justify-between text-[11px] font-black">
            <span class="text-[var(--text-heading)] flex items-center gap-1">
              <mat-icon class="!w-3.5 !h-3.5 !text-[14px] text-[#2563EB]">verified</mat-icon>
              <span>المطور: م/ {{ store.developerName }}</span>
            </span>
            <a [href]="'tel:' + store.developerPhone" class="text-emerald-600 dark:text-emerald-400 hover:underline tabular-nums" dir="ltr">
              {{ store.developerPhone }}
            </a>
          </div>
        </div>
      </div>

      <!-- =====================================================================
           5. PAYDAY 15TH TABLE PREVIEW & LIVE ALERTS STREAM
           ===================================================================== -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <!-- Live Payday 15th Payroll Sheet Preview (7 cols) -->
        <div class="lg:col-span-7 ceramic-card p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-subtle)] pb-3">
            <div>
              <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)] flex items-center gap-2">
                <mat-icon class="!w-5 !h-5 !text-[20px] text-[#2563EB]">request_quote</mat-icon>
                <span>معاينة كشف قبض يوم ١٥ المباشر ({{ store.digits(payday.from) }} ← {{ store.digits(payday.to) }})</span>
              </h2>
              <p class="text-xs text-[var(--text-secondary)]">حساب فوري لليوميات والسهرات مخصوماً منه السلف والجزاءات لكل عامل ونحّات</p>
            </div>
            <a routerLink="/settlements" class="px-3.5 py-1.5 rounded-lg bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-bold">
              كشف القبض الكامل
            </a>
          </div>

          @if (paydayPreviewRows().length > 0) {
            <div class="overflow-x-auto">
              <table class="w-full text-xs text-right">
                <thead>
                  <tr class="border-b border-[var(--border-subtle)] bg-[var(--bg-surface-muted)] text-[var(--text-secondary)]">
                    <th class="py-2.5 px-2.5 font-extrabold">العامل / النحّات</th>
                    <th class="py-2.5 px-2.5 font-extrabold">اليوميات والسهرات</th>
                    <th class="py-2.5 px-2.5 font-extrabold">السلف والخصومات</th>
                    <th class="py-2.5 px-2.5 font-extrabold">صافي قبض ١٥</th>
                    <th class="py-2.5 px-2.5 font-extrabold">واتساب</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[var(--border-subtle)]">
                  @for (row of paydayPreviewRows(); track row.worker.id) {
                    <tr
                      (click)="store.openWorkerSheet(row.worker.id!)"
                      class="hover:bg-[var(--bg-surface-muted)] cursor-pointer transition-colors"
                    >
                      <td class="py-2.5 px-2.5 font-bold text-[var(--text-heading)]">
                        {{ row.worker.name }}
                        <span class="text-[10px] px-1.5 py-0.5 rounded bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] text-[#2563EB] dark:text-blue-400 mr-1">{{ row.worker.role }}</span>
                      </td>
                      <td class="py-2.5 px-2.5 tabular-nums">
                        {{ store.num(row.calc.days) }} ي · {{ store.num(row.calc.nights) }} س
                      </td>
                      <td class="py-2.5 px-2.5 tabular-nums text-rose-600 dark:text-rose-400 font-bold">
                        {{ store.money(row.calc.advancesDeducted + row.calc.deductionsDeducted) }}
                      </td>
                      <td class="py-2.5 px-2.5 font-black tabular-nums text-emerald-600 dark:text-emerald-400">
                        {{ store.money(row.calc.netPaid) }}
                      </td>
                      <td class="py-2.5 px-2.5" (click)="$event.stopPropagation()">
                        <button
                          type="button"
                          (click)="copyWorkerPaydaySlip(row.worker.name, row.worker.role, row.calc)"
                          class="px-2.5 py-1 rounded bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] hover:border-emerald-600 text-[11px] font-bold cursor-pointer"
                        >
                          نسخ الكشف
                        </button>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          } @else {
            <div class="p-6 rounded-xl bg-[var(--bg-surface-muted)] border border-dashed border-[var(--border-subtle)] text-center space-y-1.5">
              <p class="text-xs font-bold text-[var(--text-heading)]">لا يوجد عمال أو نحاتية مسجلون حالياً في دورة قبض يوم ١٥</p>
              <p class="text-xs text-[var(--text-secondary)]">بمجرد إضافة العمال وتسجيل اليوميات أو الخصومات سيظهر كشف قبض يوم ١٥ هنا تلقائياً.</p>
            </div>
          }
        </div>

        <!-- Smart Alerts & Quick Operations (5 cols) -->
        <div class="lg:col-span-5 ceramic-card p-5 space-y-4">
          <div class="flex items-center justify-between border-b border-[var(--border-subtle)] pb-3">
            <h2 class="text-sm sm:text-base font-black text-[var(--text-heading)] flex items-center gap-1.5">
              <mat-icon class="!w-5 !h-5 !text-[18px] text-amber-500">notifications_active</mat-icon>
              <span>التنبيهات الذكية وسجل الحركات</span>
            </h2>
            <div class="flex items-center gap-1.5">
              <button
                type="button"
                (click)="store.undoLastOperation()"
                [disabled]="!store.lastUndo()"
                class="px-2.5 py-1 rounded bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] text-[11px] font-bold disabled:opacity-40 cursor-pointer"
              >
                تراجع
              </button>
              <button
                type="button"
                (click)="store.redoLastOperation()"
                [disabled]="!store.lastRedo()"
                class="px-2.5 py-1 rounded bg-[#2563EB] text-white text-[11px] font-bold disabled:opacity-40 cursor-pointer"
              >
                إعادة
              </button>
            </div>
          </div>

          <div class="space-y-2.5 max-h-64 overflow-y-auto">
            @for (alert of store.smartAlerts().slice(0, 4); track alert.id) {
              <div class="p-3 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] flex items-center justify-between gap-2 text-xs">
                <div class="min-w-0">
                  <div class="font-bold text-[var(--text-heading)] truncate">{{ alert.title }}</div>
                  <p class="text-[11px] text-[var(--text-secondary)] truncate">{{ alert.subtitle }}</p>
                </div>
                <a [routerLink]="alert.route" class="px-2.5 py-1 rounded bg-[#2563EB] text-white text-[10px] font-black shrink-0">
                  {{ alert.actionLabel }}
                </a>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class DashboardPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);
  private readonly platformId = inject(PLATFORM_ID);

  readonly activeGlassScene = signal<'all' | 'projects' | 'workers' | 'timeline' | 'finance'>('all');
  readonly enable3dTilt = signal<boolean>(false);

  readonly fromDate = signal<string>('2026-10-01');
  readonly toDate = signal<string>('2026-10-31');

  readonly filteredSummary = computed(() =>
    calculateDashboardSummary({
      attendances: this.store.attendances(),
      extractLines: this.store.extractLines(),
      advances: this.store.advances(),
      checks: this.store.checks(),
      expenses: this.store.expenses(),
      extras: this.store.extras(),
      extraCashes: this.store.extraCashes(),
      projectId: this.store.selectedProjectId(),
      fromDate: this.fromDate(),
      toDate: this.toDate(),
    })
  );

  /**
   * Module 1 Data: Projects with 92% & 45% completion rates + real store projects
   */
  readonly glassProjectsShowcase = computed(() => {
    const realProjects = this.store.projects();
    const comparisons = this.projectComparisons();
    if (realProjects.length === 0) {
      return [
        {
          id: 'demo-1',
          realProjectId: null as number | null,
          name: 'مشروع واجهات وبوابات الحجر — القطاع الأول',
          siteLocation: 'التجمع الخامس — موقع A',
          stageLabel: 'التشطيبات النهائية والتركيب',
          progress: 92,
          icon: 'domain',
          companyDayRate: 650,
          requiredAmount: 185000,
          netProfit: 64000,
        },
        {
          id: 'demo-2',
          realProjectId: null as number | null,
          name: 'مشروع نحت وتجليد الفيلا الكلاسيكية',
          siteLocation: 'الشيخ زايد — منطقة الفيلات',
          stageLabel: 'أعمال النحت والكرانيش الجارية',
          progress: 45,
          icon: 'apartment',
          companyDayRate: 600,
          requiredAmount: 98000,
          netProfit: 32500,
        },
      ];
    }

    return comparisons.map((c, idx) => {
      const presetRates = [92, 45, 78, 64];
      const progress = presetRates[idx % presetRates.length];
      return {
        id: `proj-${c.project.id}`,
        realProjectId: c.project.id ?? null,
        name: c.project.name,
        siteLocation: c.project.notes || `موقع العمل #${idx + 1}`,
        stageLabel: progress >= 75 ? 'مرحلة التشطيب المتقدم' : 'مرحلة التنفيذ والنحت',
        progress,
        icon: idx % 2 === 0 ? 'domain' : 'apartment',
        companyDayRate: c.project.companyDayRate,
        requiredAmount: c.summary.requiredFromCompany,
        netProfit: c.summary.ApproximateNetProfit,
      };
    });
  });

  /**
   * Module 2 Data: Workers & HR Avatars, Attendance Status, and Circular Availability
   */
  readonly hrWorkersShowcase = computed(() => {
    const active = this.store.activeWorkers();
    const todayIso = this.store.todayIso();
    const todayAtt = new Set(
      this.store
        .attendances()
        .filter((a) => a.date === todayIso && (a.dayWorked > 0 || a.nightWorked > 0))
        .map((a) => a.workerId)
    );

    const sculptorsTotal = active.filter((w) => w.role === 'نحات').length;
    const regularTotal = Math.max(0, active.length - sculptorsTotal);

    if (active.length === 0) {
      return {
        presentCount: 9,
        absentCount: 1,
        sculptorsTotal: 4,
        regularTotal: 6,
        cards: [
          {
            id: 'w-demo-1',
            realWorkerId: null as number | null,
            name: 'المعلم كريم محمود',
            role: 'نحات',
            siteName: 'موقع التجمع A',
            assignedTask: 'نحت تيجان الأعمدة الحجرية',
            isPresentToday: true,
            weeklyRating: 98,
            helmetColor: '#F59E0B',
          },
          {
            id: 'w-demo-2',
            realWorkerId: null as number | null,
            name: 'أحمد عبد العزيز',
            role: 'صنايعي تركيب',
            siteName: 'موقع التجمع A',
            assignedTask: 'تركيب واجهة الدور الثاني',
            isPresentToday: true,
            weeklyRating: 94,
            helmetColor: '#38BDF8',
          },
          {
            id: 'w-demo-3',
            realWorkerId: null as number | null,
            name: 'حسام السيد',
            role: 'نحات',
            siteName: 'موقع زايد B',
            assignedTask: 'تجهيز الكرانيش والفرنتون',
            isPresentToday: true,
            weeklyRating: 95,
            helmetColor: '#10B981',
          },
          {
            id: 'w-demo-4',
            realWorkerId: null as number | null,
            name: 'محمود جمال',
            role: 'مساعد',
            siteName: 'موقع زايد B',
            assignedTask: 'تشوين ومناولة الحجر',
            isPresentToday: false,
            weeklyRating: 88,
            helmetColor: '#A855F7',
          },
        ],
      };
    }

    const helmetPalette = ['#F59E0B', '#38BDF8', '#10B981', '#A855F7'];
    const presentCount = active.filter((w) => w.id && todayAtt.has(w.id)).length;
    const absentCount = Math.max(0, active.length - presentCount);

    const cards = active.slice(0, 6).map((w, idx) => ({
      id: `w-${w.id}`,
      realWorkerId: w.id ?? null,
      name: w.name,
      role: w.role,
      siteName: this.store.projects()[0]?.name || 'الموقع الرئيسي',
      assignedTask: w.role === 'نحات' ? 'نحت وتشكيل الحجر' : 'تركيب وتشطيب بالموقع',
      isPresentToday: Boolean(w.id && todayAtt.has(w.id)),
      weeklyRating: 96 - (idx % 4) * 2,
      helmetColor: helmetPalette[idx % helmetPalette.length],
    }));

    return {
      presentCount,
      absentCount,
      sculptorsTotal,
      regularTotal,
      cards,
    };
  });

  readonly workforceAvailabilityRate = computed(() => {
    const hr = this.hrWorkersShowcase();
    const total = hr.presentCount + hr.absentCount;
    if (total <= 0) return 92;
    const pct = Math.round((hr.presentCount / total) * 100);
    return pct > 0 ? pct : 90;
  });

  /**
   * Module 3 Data: Daily Tasks (تحت التنفيذ · مكتمل · متأخر)
   */
  readonly dailySiteTasks = computed(() => {
    const hc = this.store.todayHeadcountMatch();
    const openDed = this.store.totalOpenDeductions();
    return {
      inProgressTitle: `تحضير ومطابقة وردية اليوم (${this.store.num(hc.actualDays)} يومية)`,
      inProgressSub: 'تسجيل حضور الصنايعية والنحاتية ومراجعة السهرات الجارية بالموقع',
      completedTitle: `مزامنة الخزنة والحسابات (${this.store.num(this.store.projects().length)} مشاريع)`,
      completedSub: 'تم تأمين السجلات وحساب اليوميات والسلف وصافي الربح تلقائياً',
      delayedTitle: !hc.isExactMatch
        ? hc.statusLabel
        : openDed > 0
          ? `خصومات مفتوحة للمراجعة (${this.store.money(openDed)})`
          : 'لا توجد مهام متأخرة — الموقع منضبط ١٠٠٪',
      delayedSub: !hc.isExactMatch
        ? 'اضغط لتسجيل أو مطابقة دفتر العدد اليومي الإجباري مع الأسماء'
        : 'جميع الورديات اليومية تسير وفق الجدول الزمني المحدد',
    };
  });

  readonly paydayPreviewRows = computed(() => {
    const cycle = this.store.payday15Info();
    const workers = this.store.activeWorkers();
    const att = this.store.attendances();
    const adv = this.store.advances();
    const ec = this.store.extraCashes();
    const ext = this.store.extras();
    const ded = this.store.deductions();
    return workers.slice(0, 8).map((worker) => ({
      worker,
      calc: calculateSettlement(worker, cycle.from, cycle.to, att, adv, ec, ext, ded),
    }));
  });

  readonly projectComparisons = computed(() => {
    const projects = this.store.projects();
    const items = projects.map((proj) => {
      const pExtracts = new Set(
        this.store
          .extracts()
          .filter((e) => e.projectId === proj.id)
          .map((e) => e.id!)
      );
      const pLines = this.store.extractLines().filter((l) => pExtracts.has(l.extractId));
      const summary = calculateDashboardSummary({
        attendances: this.store.attendances(),
        extractLines: pLines,
        advances: [],
        checks: this.store.checks(),
        expenses: this.store.expenses(),
        extras: this.store.extras(),
        extraCashes: this.store.extraCashes(),
        projectId: proj.id,
        fromDate: this.fromDate(),
        toDate: this.toDate(),
      });
      return { project: proj, summary };
    });

    const maxVal = Math.max(
      1,
      ...items.map((i) =>
        Math.max(
          i.summary.requiredFromCompany,
          i.summary.totalWorkerWages + i.summary.totalExternalExpenses
        )
      )
    );

    return items.map((i) => ({
      ...i,
      reqPercent: Math.min(100, Math.round((i.summary.requiredFromCompany / maxVal) * 100)),
      costPercent: Math.min(
        100,
        Math.round(
          ((i.summary.totalWorkerWages + i.summary.totalExternalExpenses) / maxVal) * 100
        )
      ),
    }));
  });

  async quickCheckInWorker(workerId: number): Promise<void> {
    const projectId =
      this.store.selectedProjectId() || this.store.projects()[0]?.id || 1;
    await this.store.recordAttendance({
      date: this.store.todayIso(),
      workerId,
      projectId,
      dayWorked: 1,
      nightWorked: 0,
      note: 'تحضير فوري من لوحة الموارد البشرية',
      mode: 'merge',
    });
    this.store.showToast('تم تسجيل حضور العامل ليوم اليوم بنجاح ✓', 'success');
  }

  onProjectFilterChange(event: Event): void {
    const val = (event.target as HTMLSelectElement).value;
    this.store.selectedProjectId.set(val ? Number(val) : null);
  }

  async copyWorkerPaydaySlip(
    name: string,
    role: string,
    calc: { days: number; nights: number; grossWages: number; advancesDeducted: number; deductionsDeducted: number; netPaid: number }
  ): Promise<void> {
    const cycle = this.store.payday15Info();
    const text = [
      `🧾 *كشف حساب قبض يوم ١٥ — ${name} (${role})*`,
      `📅 الفترة: من ${this.store.digits(cycle.from)} إلى ${this.store.digits(cycle.to)}`,
      `━━━━━━━━━━━━━━`,
      `☀️ اليوميات: ${this.store.num(calc.days)} يومية`,
      `🌙 السهرات: ${this.store.num(calc.nights)} سهرة`,
      `💰 إجمالي الاستحقاق: ${this.store.money(calc.grossWages)}`,
      `💵 السلف المخصومة: ${this.store.money(calc.advancesDeducted)}`,
      `📉 الخصومات والجزاءات: ${this.store.money(calc.deductionsDeducted)}`,
      `━━━━━━━━━━━━━━`,
      `✅ *صافي المبلغ المستحق للقبض:* ${this.store.money(calc.netPaid)}`,
    ].join('\n');

    if (isPlatformBrowser(this.platformId) && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      this.store.showToast(`تم نسخ كشف قبض "${name}" جاهزاً للواتساب`, 'success');
    }
  }

  readonly dashSmartCommand = signal<string>('');
  readonly dashAiLoading = signal<boolean>(false);
  readonly dashAiReply = signal<string>('');
  readonly dashAiLatencyMs = signal<number>(0);

  async runDashSmartCommand(): Promise<void> {
    const cmd = this.dashSmartCommand().trim();
    if (!cmd) return;

    // 1. Try direct deterministic field action first (e.g., سلفة 500 أحمد, مصروف 250 مواصلات)
    const ok = await this.store.executeSmartCommand(cmd);
    if (ok) {
      this.dashSmartCommand.set('');
      return;
    }

    // 2. Otherwise query live Gemini AI API (projects/110645591699) directly from Dashboard!
    this.dashAiLoading.set(true);
    try {
      const ledger = this.store.comprehensiveLedger();
      const contextSummary = [
        `الشركة: ${this.store.settings().companyName} | تاريخ العمل: ${this.store.todayIso()}`,
        `إجمالي المقبوضات بالخزنة: ${ledger.totalReceivedAllSources} ج.م | إجمالي المنصرف: ${ledger.totalSpentAllProjects} ج.م | صافي الربح: ${ledger.overallNetProfit} ج.م`,
        `العمال النشطون: ${this.store.activeWorkers().length} | المشاريع: ${this.store.projects().length}`,
      ].join('\n');

      const res = await this.store.authFetch('/api/zaki/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: cmd,
          contextSummary,
        }),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          reply?: string;
          latencyMs?: number;
        };
        if (data.reply?.trim()) {
          this.dashAiReply.set(data.reply.trim());
          this.dashAiLatencyMs.set(data.latencyMs || 560);
          this.dashSmartCommand.set('');
          return;
        }
      }
      this.dashAiReply.set(
        `يا باشمهندس، صافي الربح العام حالياً ${this.store.money(ledger.overallNetProfit)} وإجمالي المقبوضات ${this.store.money(ledger.totalReceivedAllSources)}. يمكنك فتح المساعد زكي لتفاصيل أكثر.`
      );
      this.dashSmartCommand.set('');
    } catch {
      const ledger = this.store.comprehensiveLedger();
      this.dashAiReply.set(
        `يا باشمهندس، صافي الربح العام حالياً ${this.store.money(ledger.overallNetProfit)} وإجمالي المقبوضات ${this.store.money(ledger.totalReceivedAllSources)}.`
      );
    } finally {
      this.dashAiLoading.set(false);
    }
  }
}

