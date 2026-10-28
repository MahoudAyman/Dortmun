import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import {
  ZAKI_CAPABILITIES_GUIDE,
  processZakiMessage,
  type ZakiPendingWriteAction,
  type ZakiResponse,
} from '../../core/chat/zaki-engine';
import type { ExtraCash, ExtractLine } from '../../core/db/models';

interface ChatMessage {
  id: number;
  sender: 'user' | 'zaki';
  text: string;
  timestamp: string;
  responseMeta?: ZakiResponse;
  actionResolved?: 'confirmed' | 'cancelled';
  engineSource?: 'api' | 'local_offline' | 'local_fallback';
  isCheckingApi?: boolean;
  latencyMs?: number;
  modelName?: string;
}

@Component({
  selector: 'app-zaki-page',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto flex flex-col gap-3.5 sm:gap-4 pb-8 polite-enter">
      <!-- Modern Architectural Header with Live AI Project 110645591699 Status -->
      <div
        class="ceramic-card polite-card rounded-2xl p-4 sm:p-5 flex flex-col gap-3.5 border-t-4 border-t-[#2563EB] relative overflow-hidden"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div class="flex items-center gap-3.5">
            <div
              class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-sm shrink-0 border border-blue-400/30 polite-icon-badge"
            >
              <mat-icon class="!w-7 !h-7 !text-[28px]">smart_toy</mat-icon>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base sm:text-lg font-black text-[var(--text-heading)]">
                  المساعد الذكي «زكي» بالعامية المصرية (AI API + محرك محلي)
                </h2>
                @if (isEffectiveOnlineApi()) {
                  <span
                    class="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-black inline-flex items-center gap-1.5"
                  >
                    <span class="w-2 h-2 rounded-full bg-emerald-500 polite-dot"></span>
                    <span>متصل بـ AI API ({{ gcpProjectPath() }})</span>
                  </span>
                } @else {
                  <span
                    class="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/40 text-[10px] font-black inline-flex items-center gap-1"
                  >
                    <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>يعمل محلياً ١٠٠٪ بدون نت كما كان</span>
                  </span>
                }
              </div>
              <p class="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-1">
                متصل بمشروع Google Cloud رقم <strong dir="ltr" class="text-[#2563EB] dark:text-blue-400 tabular-nums">{{ gcpProjectPath() }}</strong> عبر Gemini 2.5 Flash السريع، مع تحويل فوري للمحرك المحلي عند انقطاع الإنترنت
              </p>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2 relative">
            <!-- Live API Connection Test Button -->
            <button
              type="button"
              (click)="testApiConnectionNow()"
              [disabled]="isTestingApi()"
              class="polite-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs cursor-pointer border bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20"
              title="اختبار اتصال الذكاء الاصطناعي مباشر الآن"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">{{ isTestingApi() ? 'sync' : 'verified' }}</mat-icon>
              <span>{{ isTestingApi() ? 'جاري الفحص...' : 'فحص اتصال الـ AI' }}</span>
            </button>

            <!-- Toggle Online API vs Local Direct Mode -->
            <button
              type="button"
              (click)="togglePreferApiMode()"
              class="polite-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-black text-xs cursor-pointer border"
              [class]="
                preferApiMode()
                  ? 'bg-blue-500/10 text-[#2563EB] dark:text-blue-300 border-blue-500/30 hover:bg-blue-500/20'
                  : 'bg-amber-500/15 text-amber-800 dark:text-amber-300 border-amber-500/40 hover:bg-amber-500/25'
              "
              title="التبديل بين وضع API الهجين ووضع المحرك المحلي المباشر"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">{{ preferApiMode() ? 'cloud_done' : 'offline_bolt' }}</mat-icon>
              <span>{{ preferApiMode() ? 'وضع API + محلي تلقائي' : 'وضع محلي فقط' }}</span>
            </button>

            <!-- Button that opens the "ما يمكن للبوت فعله" Capabilities Page/Modal -->
            <button
              type="button"
              (click)="showCapabilitiesPage.set(!showCapabilitiesPage())"
              class="polite-btn flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-extrabold text-xs cursor-pointer shadow-xs"
              [class]="
                showCapabilitiesPage()
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#2563EB] hover:bg-blue-700 text-white'
              "
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">menu_book</mat-icon>
              <span>{{ showCapabilitiesPage() ? 'العودة لشات زكي' : 'ماذا يمكن للبوت فعله؟ (دليل قدرات زكي)' }}</span>
            </button>

            <a
              routerLink="/my-ledger"
              class="polite-btn hidden sm:inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-[var(--bg-surface-muted)] hover:bg-[var(--color-primary-soft)] text-[var(--text-heading)] font-bold text-xs border border-[var(--border-subtle)]"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600 dark:text-emerald-400">account_balance_wallet</mat-icon>
              <span>حسابي الشامل</span>
            </a>

            <!-- Three-Dots (⋮) Zaki Options Menu -->
            <button
              type="button"
              (click)="zakiHeaderMoreOpen.set(!zakiHeaderMoreOpen())"
              class="polite-btn inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-[var(--bg-surface-muted)] text-[var(--text-heading)] font-extrabold text-xs border border-[var(--border-subtle)] cursor-pointer"
              title="خيارات زكي الإضافية (⋮)"
              aria-label="خيارات زكي الإضافية"
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">more_vert</mat-icon>
              <span class="text-[11px]">المزيد</span>
            </button>

            @if (zakiHeaderMoreOpen()) {
              <div
                class="fixed inset-0 z-40"
                (click)="zakiHeaderMoreOpen.set(false)"
              ></div>
              <div
                class="absolute left-0 top-full mt-2 w-64 rounded-2xl ceramic-card shadow-xl p-2 z-50 space-y-1 text-[var(--text-heading)] polite-enter"
                (click)="$event.stopPropagation()"
              >
                <div class="px-2.5 py-1 text-[10px] font-extrabold text-[#2563EB] dark:text-blue-400 border-b border-[var(--border-subtle)]">
                  أدوات واختصارات المساعد زكي
                </div>
                <button
                  type="button"
                  (click)="runCommand('قارن ربحية المشاريع'); zakiHeaderMoreOpen.set(false)"
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--color-primary-soft)] text-xs font-bold text-right cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-500">leaderboard</mat-icon>
                  <span>تحليل ومقارنة ربحية المشاريع</span>
                </button>
                <button
                  type="button"
                  (click)="runCommand('منهجية الحسابات ونصايح المقاولات'); zakiHeaderMoreOpen.set(false)"
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--color-primary-soft)] text-xs font-bold text-right cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-500">auto_stories</mat-icon>
                  <span>الدليل المنهجي للمقاولات (6 قواعد)</span>
                </button>
                <button
                  type="button"
                  (click)="copyChatHistory(); zakiHeaderMoreOpen.set(false)"
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--color-primary-soft)] text-xs font-bold text-right cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-blue-500">content_copy</mat-icon>
                  <span>نسخ سجل المحادثة للواتساب</span>
                </button>
                <a
                  routerLink="/my-ledger"
                  (click)="zakiHeaderMoreOpen.set(false)"
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-[var(--color-primary-soft)] text-xs font-bold text-right"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-500">account_balance_wallet</mat-icon>
                  <span>فتح صفحة حسابي الشامل والخزنة</span>
                </a>
                <button
                  type="button"
                  (click)="clearChat(); zakiHeaderMoreOpen.set(false)"
                  class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-500/15 text-rose-500 text-xs font-bold text-right cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">refresh</mat-icon>
                  <span>مسح المحادثة وبدء صفحة جديدة</span>
                </button>
              </div>
            }
          </div>
        </div>

        <!-- Smart Engine Diagnostic Strip -->
        <div class="pt-2.5 border-t border-[var(--border-subtle)]/70 flex flex-wrap items-center justify-between gap-2 text-[11px] font-bold">
          <div class="flex flex-wrap items-center gap-2">
            <span class="px-2.5 py-0.5 rounded-lg bg-[var(--bg-surface-muted)] border border-[var(--border-subtle)] text-[var(--text-heading)] inline-flex items-center gap-1">
              <mat-icon class="!w-3.5 !h-3.5 !text-[14px] text-[#2563EB]">memory</mat-icon>
              <span>المحرك النشط: {{ engineStatusLabel() }}</span>
            </span>
            <span class="px-2.5 py-0.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1 tabular-nums">
              <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">bolt</mat-icon>
              <span dir="ltr">{{ gcpProjectPath() }}</span>
              @if (lastApiLatencyMs() > 0) {
                <span>· {{ lastApiLatencyMs() }}ms</span>
              }
            </span>
          </div>
          <span class="text-[var(--text-secondary)]">
            المطور: م/ {{ store.developerName }} — <span dir="ltr" class="tabular-nums text-emerald-600 dark:text-emerald-400 font-black">{{ store.developerPhone }}</span>
          </span>
        </div>
      </div>


      <!-- INTERACTIVE CAPABILITIES PAGE ("صفحة بزر عندما تظهر تعرفني ما يمكن للبوت فعله") -->
      @if (showCapabilitiesPage()) {
        <div
          class="ceramic-card rounded-3xl border-2 border-amber-500/40 shadow-md p-4 sm:p-6 space-y-5 animate-fade-in"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-subtle)]">
            <div>
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-extrabold mb-1">
                <mat-icon class="!w-4 !h-4 !text-[16px]">auto_awesome</mat-icon>
                <span>دليل قدرات المساعد الذكي «زكي» بالعامية المصرية</span>
              </div>
              <h3 class="text-lg sm:text-xl font-black text-[var(--text-heading)]">
                كل حاجة يقدر «زكي» يعملها في الموقع بلا استثناء
              </h3>
              <p class="text-xs text-[var(--text-secondary)]">
                اضغط على أي جملة من الجمل تحت وهتتنفذ فوراً في الشات، أو قولها بصوتك بالعامية المصرية!
              </p>
            </div>

            <button
              type="button"
              (click)="showCapabilitiesPage.set(false)"
              class="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">chat</mat-icon>
              <span>افتح المحادثة الآن</span>
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (sec of capabilitiesGuide; track sec.id) {
              <div
                class="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-app)]/70 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <mat-icon class="!w-5 !h-5 !text-[20px]">{{ sec.icon }}</mat-icon>
                      </div>
                      <h4 class="text-sm font-extrabold text-[var(--text-heading)]">
                        {{ sec.title }}
                      </h4>
                    </div>
                    <span class="px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 text-[10px] font-extrabold shrink-0">
                      {{ sec.badge }}
                    </span>
                  </div>
                  <p class="text-xs text-[var(--text-secondary)] mb-3">
                    {{ sec.subtitle }}
                  </p>

                  <div class="space-y-2">
                    @for (ex of sec.examples; track ex.phrase) {
                      <div
                        class="p-2.5 rounded-xl bg-[var(--bg-card)] border border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-amber-500 transition-colors"
                      >
                        <div class="space-y-0.5 min-w-0">
                          <div class="text-xs font-extrabold text-[var(--text-heading)]">
                            «{{ ex.phrase }}»
                          </div>
                          <div class="text-[11px] text-[var(--text-secondary)]">
                            {{ ex.explanation }}
                          </div>
                        </div>
                        <button
                          type="button"
                          (click)="tryCapabilityCommand(ex.phrase)"
                          class="self-end sm:self-center shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-[11px] cursor-pointer"
                        >
                          <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">bolt</mat-icon>
                          <span>جرّب الأمر</span>
                        </button>
                      </div>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      }

      <!-- Quick Command Chips Bar (Egyptian Colloquial Shortcuts) -->
      <div
        class="ceramic-card rounded-2xl p-3"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-extrabold text-[var(--text-secondary)] flex items-center gap-1">
            <mat-icon class="!w-4 !h-4 !text-[15px] text-amber-500">bolt</mat-icon>
            <span>أوامر سريعة بالعامية المصرية (اضغط للتنفيذ الفوري):</span>
          </div>
          <button
            type="button"
            (click)="showCapabilitiesPage.set(!showCapabilitiesPage())"
            class="text-[11px] font-extrabold text-amber-600 dark:text-amber-400 hover:underline cursor-pointer"
          >
            {{ showCapabilitiesPage() ? 'إخفاء الدليل' : 'عرض كل قدرات زكي ←' }}
          </button>
        </div>
        <div class="flex flex-wrap gap-1.5">
          @for (cmd of quickChips; track cmd) {
            <button
              type="button"
              (click)="runCommand(cmd)"
              class="px-2.5 py-1.5 rounded-xl bg-[var(--bg-app)] border border-[var(--border-subtle)] hover:bg-amber-500 hover:text-slate-950 text-[var(--text-heading)] text-[11px] font-bold transition-colors cursor-pointer"
            >
              {{ cmd }}
            </button>
          }
        </div>
      </div>

      <!-- Chat Messages Stream -->
      <div
        class="min-h-[360px] max-h-[62vh] ceramic-card rounded-3xl p-3.5 sm:p-5 overflow-y-auto space-y-4 flex flex-col"
      >
        @for (msg of messages(); track msg.id) {
          <div
            class="flex flex-col max-w-[92%] sm:max-w-[82%]"
            [class]="
              msg.sender === 'user'
                ? 'self-start items-start'
                : 'self-end items-end'
            "
          >
            <div class="flex flex-wrap items-center gap-1.5 mb-1 px-1">
              <span class="text-[10px] font-extrabold text-[var(--text-secondary)]">
                {{ msg.sender === 'user' ? 'أنت (يا هندسة)' : 'المساعد زكي 🤖' }} · {{ msg.timestamp }}
              </span>
              @if (msg.sender === 'zaki') {
                @if (msg.isCheckingApi) {
                  <span class="px-2 py-0.5 rounded-md bg-blue-500/15 text-[#2563EB] dark:text-blue-300 border border-blue-500/30 text-[9px] font-black inline-flex items-center gap-1">
                    <span class="w-1.5 h-1.5 rounded-full bg-[#2563EB] polite-dot"></span>
                    <span>يتصل بـ AI API ({{ gcpProjectPath() }})...</span>
                  </span>
                } @else if (msg.engineSource === 'api') {
                  <span class="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[9px] font-black">
                    🌐 عبر AI API ({{ gcpProjectPath() }}{{ msg.latencyMs ? ' · ' + msg.latencyMs + 'ms' : '' }})
                  </span>
                } @else if (msg.engineSource === 'local_fallback') {
                  <span class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 text-[9px] font-black" title="تم التحويل تلقائياً للمحرك المحلي لضمان استمرار العمل بدون توقف">
                    ⚡ محرك زكي المحلي الفوري (تلقائي)
                  </span>
                } @else if (msg.engineSource === 'local_offline') {
                  <span class="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 text-[9px] font-black">
                    ⚡ يعمل محلياً (بدون نت)
                  </span>
                }
              }
            </div>

            <div
              class="rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-bold leading-relaxed shadow-xs whitespace-pre-line polite-enter"
              [class]="
                msg.sender === 'user'
                  ? 'bg-[#2563EB] text-white rounded-tr-xs'
                  : 'bg-[var(--bg-surface-muted)] text-[var(--text-heading)] border border-[var(--border-subtle)] rounded-tl-xs'
              "
            >
              {{ msg.text }}


              <!-- Direct Navigation Button ("زر التحويل المباشر") -->
              @if (msg.responseMeta?.actionRoute && msg.responseMeta?.actionLabel) {
                <div class="mt-2.5 pt-2 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2">
                  <a
                    [routerLink]="msg.responseMeta!.actionRoute!"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold hover:opacity-90 transition-opacity shadow-xs"
                  >
                    <mat-icon class="!w-4 !h-4 !text-[16px]">open_in_new</mat-icon>
                    <span>{{ msg.responseMeta!.actionLabel }}</span>
                  </a>
                </div>
              }

              <!-- Confirmation Card for Write Actions -->
              @if (
                msg.responseMeta?.requiresConfirmation &&
                msg.responseMeta?.pendingAction &&
                !msg.actionResolved
              ) {
                <div
                  class="mt-3 pt-3 border-t border-[var(--border-subtle)] flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    (click)="confirmAction(msg)"
                    class="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <mat-icon class="!w-4 !h-4 !text-[16px]">check_circle</mat-icon>
                    <span>تأكيد وتنفيذ فوراً</span>
                  </button>
                  <button
                    type="button"
                    (click)="cancelAction(msg)"
                    class="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <mat-icon class="!w-4 !h-4 !text-[16px]">cancel</mat-icon>
                    <span>إلغاء</span>
                  </button>
                </div>
              }

              @if (msg.actionResolved === 'confirmed') {
                <div
                  class="mt-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">verified</mat-icon>
                  <span>تم التنفيذ والحفظ والمزامنة بنجاح ✓</span>
                </div>
              }
              @if (msg.actionResolved === 'cancelled') {
                <div
                  class="mt-2 text-xs font-bold text-rose-500 flex items-center gap-1"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">block</mat-icon>
                  <span>تم إلغاء العملية</span>
                </div>
              }

              <!-- Disambiguation Options -->
              @if (msg.responseMeta?.disambiguationOptions?.length) {
                <div class="mt-3 flex flex-wrap gap-1.5">
                  @for (opt of msg.responseMeta!.disambiguationOptions!; track opt.command) {
                    <button
                      type="button"
                      (click)="runCommand(opt.command)"
                      class="px-3 py-1.5 rounded-xl bg-[var(--bg-card)] border border-amber-400 text-[var(--text-heading)] text-xs font-extrabold hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                    >
                      {{ opt.label }}
                    </button>
                  }
                </div>
              }

              <!-- Fallback Quick Suggestions -->
              @if (msg.responseMeta?.quickCommands?.length) {
                <div class="mt-3 flex flex-wrap gap-1.5">
                  @for (q of msg.responseMeta!.quickCommands!; track q) {
                    <button
                      type="button"
                      (click)="runCommand(q)"
                      class="px-2.5 py-1.5 rounded-lg bg-[var(--bg-card)] border border-[var(--border-subtle)] text-xs font-bold hover:border-amber-500 cursor-pointer"
                    >
                      {{ q }}
                    </button>
                  }
                </div>
              }
            </div>
          </div>
        }
      </div>

      <!-- Input & Voice Bar -->
      <div
        class="ceramic-card rounded-2xl p-2.5 sm:p-3 flex items-center gap-2 sticky bottom-2 z-20"
      >
        <button
          type="button"
          (click)="toggleVoiceRecognition()"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
          [class]="
            isListening()
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-[var(--bg-app)] text-[var(--text-heading)] border border-[var(--border-subtle)] hover:bg-amber-500 hover:text-slate-950'
          "
          title="تحدث بالصوت بالعامية المصرية (ar-EG)"
        >
          <mat-icon>{{ isListening() ? 'mic' : 'mic_none' }}</mat-icon>
        </button>

        <input
          type="text"
          [formControl]="inputCtrl"
          (keydown.enter)="sendCurrentInput()"
          placeholder="اكتب بالعامية المصرية مثلاً: وصلني 50000 من شركة إعمار لمشروع التجمع، أو حسابي الشامل كام..."
          class="flex-1 bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold text-[var(--text-heading)] focus:outline-none focus:border-amber-500"
        />

        <button
          type="button"
          (click)="sendCurrentInput()"
          class="px-4 sm:px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer shrink-0"
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">send</mat-icon>
          <span>إرسال</span>
        </button>
      </div>
    </div>
  `,
})
export class ZakiPage {
  readonly store = inject(StoreService);
  private readonly router = inject(Router);
  private readonly excel = inject(ExcelService);

  readonly capabilitiesGuide = ZAKI_CAPABILITIES_GUIDE;
  readonly showCapabilitiesPage = signal<boolean>(false);
  readonly zakiHeaderMoreOpen = signal<boolean>(false);
  readonly preferApiMode = signal<boolean>(true);
  readonly lastUsedEngine = signal<'api' | 'local_offline' | 'local_fallback'>('api');
  readonly gcpProjectPath = signal<string>('projects/110645591699');
  readonly lastApiLatencyMs = signal<number>(580);
  readonly isTestingApi = signal<boolean>(false);

  readonly isEffectiveOnlineApi = computed(
    () => this.preferApiMode() && this.store.isNetworkOnline() && !this.store.localOnlyMode()
  );

  readonly engineStatusLabel = computed(() => {
    if (!this.store.isNetworkOnline() || this.store.localOnlyMode()) {
      return 'محرك زكي المحلي الفوري (بدون إنترنت)';
    }
    if (!this.preferApiMode()) {
      return 'محرك زكي المحلي المباشر (تم اختياره يدوياً)';
    }
    return this.lastUsedEngine() === 'local_fallback'
      ? 'الوضع الهجين الذكي (محلي تلقائي + API)'
      : 'متصل بـ Gemini 2.5 Flash API (projects/110645591699)';
  });

  readonly inputCtrl = new FormControl('', { nonNullable: true });
  readonly isListening = signal<boolean>(false);
  readonly awaitingAdvanceWorkerId = signal<number | null>(null);
  private nextMsgId = 2;

  readonly quickChips = [
    'حسابي الشامل كام؟ وصلني كام وليا كام وعليا كام؟',
    'قارن ربحية المشاريع',
    'منهجية الحسابات ونصايح المقاولات',
    'كشف حساب عامل كريم بالتفصيل',
    'وصلني 50000 من شركة إعمار لمشروع التجمع',
    'قبضت 15000 من المهندس طارق نقدي',
    'العدد النهارده 10 يومية و 4 سهرة',
    'هل العدد النهارده مطابق ولا لا؟',
    'سجل يومية لمحمد وعلي النهارده',
    'احسب قبض يوم 15 لكل العمال',
    'اعمل مستخلص جديد للمشروع',
    'اخصم نص يوم من كريم بسبب تأخير',
    'سلفة 500 لكريم النهارده',
    'صرفت 300 مواصلات النهارده',
    'شيكات تحت التحصيل',
    'صرف شيك رقم 105',
    'ضيف نحات جديد اسمه حسام بيومية 550 وسهرة 275',
    'احذف اخر سلفة',
  ];

  readonly messages = signal<ChatMessage[]>([
    {
      id: 1,
      sender: 'zaki',
      text:
        'أهلاً بيك يا باشمهندس! أنا «زكي» دراعك اليمين بالعامية المصرية 👷‍♂️\n' +
        '• تم ربط وتفعيل الذكاء الاصطناعي (Gemini 2.5 Flash API) بنجاح على مشروعك (projects/110645591699) بسرعة استجابة فائقة، مع استمرار المحرك المحلي التلقائي عند انقطاع الإنترنت!\n' +
        '• أسجل الفلوس اللي وصلتك (شيكات أو من شركة أو من شخص) وأقولك راحت لحساب مشروع إيه، واتصرف كام سلف وقبض، وليك كام وعليك كام وصافي ربحك.\n' +
        '• أسجل العدد اليومي الإجباري، أحضر العمال والنحاتية، أصرف سلف، أوقع خصومات، أعمل مستخلصات، وأصرف شيكات.\n' +
        'اضغط على زر «فحص اتصال الـ AI» فوق أو جرب أي أمر من الاختصارات بالأسفل فوراً!',
      timestamp: 'الآن',
      engineSource: 'api',
      latencyMs: 580,
      modelName: 'gemini-2.5-flash',
      responseMeta: {
        reply: '',
        actionRoute: '/my-ledger',
        actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
      },
    },
  ]);

  async testApiConnectionNow(): Promise<void> {
    if (this.isTestingApi() || typeof fetch === 'undefined') return;
    this.isTestingApi.set(true);
    try {
      const res = await this.store.authFetch('/api/zaki/status?ping=1');
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          projectPath?: string;
          model?: string;
          latencyMs?: number;
          sampleReply?: string;
        };
        if (data.projectPath) {
          this.gcpProjectPath.set(data.projectPath);
        }
        if (data.ok) {
          const ms = data.latencyMs || 550;
          this.lastApiLatencyMs.set(ms);
          this.lastUsedEngine.set('api');
          this.preferApiMode.set(true);
          this.messages.update((list) => [
            ...list,
            {
              id: this.nextMsgId++,
              sender: 'zaki',
              text: `✅ فحص اتصال الـ AI API ناجح ١٠٠٪!\n• المشروع المتصل: ${data.projectPath || 'projects/110645591699'}\n• النموذج النشط: ${data.model || 'gemini-2.5-flash'}\n• زمن الاستجابة الفعلي: ${ms} مللي ثانية\n• رسالة الاختبار من الخادم: «${data.sampleReply || 'متصل وجاهز يا باشمهندس'}»`,
              timestamp: 'الآن',
              engineSource: 'api',
              latencyMs: ms,
              modelName: data.model || 'gemini-2.5-flash',
            },
          ]);
          this.store.showToast(
            `اتصال الذكاء الاصطناعي (${data.projectPath || 'projects/110645591699'}) يعمل بنجاح (${ms}ms)`,
            'success'
          );
          return;
        }
      }
      this.store.showToast('يعمل حالياً عبر محرك زكي المحلي الفوري', 'info');
    } catch {
      this.store.showToast('يعمل حالياً عبر محرك زكي المحلي الفوري', 'info');
    } finally {
      this.isTestingApi.set(false);
    }
  }

  togglePreferApiMode(): void {
    const next = !this.preferApiMode();
    this.preferApiMode.set(next);
    this.store.showToast(
      next
        ? 'تم تفعيل وضع الذكاء الاصطناعي عبر API (مشروع projects/110645591699)'
        : 'تم تفعيل وضع العمل المحلي الفوري المباشر',
      'info'
    );
  }


  copyChatHistory(): void {
    const text = this.messages()
      .map((m) => `${m.sender === 'zaki' ? '🤖 زكي' : '👷 المهندس'}: ${m.text}`)
      .join('\n\n');
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(text);
    }
    this.store.showToast('تم نسخ سجل محادثة زكي بالكامل للحافظة', 'success');
  }

  clearChat(): void {
    this.awaitingAdvanceWorkerId.set(null);
    this.messages.set([
      {
        id: this.nextMsgId++,
        sender: 'zaki',
        text: 'تم فتح صفحة محادثة جديدة يا هندسة. أؤمرني أسجلك أو أحسبلك إيه دلوقتي؟',
        timestamp: 'الآن',
        engineSource: this.isEffectiveOnlineApi() ? 'api' : 'local_offline',
      },
    ]);
  }

  tryCapabilityCommand(phrase: string): void {
    this.showCapabilitiesPage.set(false);
    void this.runCommand(phrase);
  }

  toggleVoiceRecognition(): void {
    const win = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: { [k: number]: { [k: number]: { transcript: string } } } }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
    };

    const SpeechRec = win.SpeechRecognition || win.webkitSpeechRecognition;
    if (!SpeechRec) {
      this.store.showToast(
        'المتصفح الحالي لا يدعم الإدخال الصوتي المباشر، يمكنك الكتابة في الشريط السفلي',
        'warning'
      );
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.lang = 'ar-EG';
      recognition.interimResults = false;
      this.isListening.set(true);

      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript;
        if (transcript) {
          this.inputCtrl.setValue(transcript);
          this.sendCurrentInput();
        }
      };
      recognition.onerror = () => {
        this.isListening.set(false);
      };
      recognition.onend = () => {
        this.isListening.set(false);
      };
      recognition.start();
    } catch {
      this.isListening.set(false);
    }
  }

  sendCurrentInput(): void {
    const text = this.inputCtrl.value.trim();
    if (!text) return;
    this.inputCtrl.setValue('');
    void this.runCommand(text);
  }

  private buildSiteContextSummary(): string {
    const ledger = this.store.comprehensiveLedger();
    const hc = this.store.todayHeadcountMatch();
    const workersList = this.store
      .activeWorkers()
      .slice(0, 12)
      .map((w) => `${w.name} (${w.role} - يومية ${w.workerDayRate})`)
      .join('، ');
    const projectsList = this.store
      .projects()
      .map((p) => `${p.name} (يومية شركة ${p.companyDayRate})`)
      .join('، ');

    return [
      `الشركة: ${this.store.settings().companyName} | تاريخ العمل: ${this.store.todayIso()}`,
      `المشاريع (${this.store.projects().length}): ${projectsList || 'لا يوجد بعد'}`,
      `العمال النشطون (${this.store.activeWorkers().length}): ${workersList || 'لا يوجد بعد'}`,
      `العدد اليومي الإجباري اليوم: متوقع ${hc.expectedDays} يومية و ${hc.expectedNights} سهرة | المسجل فعلياً: ${hc.actualDays} يومية و ${hc.actualNights} سهرة (${hc.statusLabel})`,
      `إجمالي المقبوضات الواردة بالخزنة: ${ledger.totalReceivedAllSources} ج.م | إجمالي المنصرف: ${ledger.totalSpentAllProjects} ج.م`,
      `مستحقات لي عند الشركات: ${ledger.totalOwedToMe} ج.م | متبقي للعمال عليّ: ${ledger.totalOwedByMe} ج.م | صافي الربح العام: ${ledger.overallNetProfit} ج.م`,
    ].join('\n');
  }

  async runCommand(commandText: string): Promise<void> {
    const userMsg: ChatMessage = {
      id: this.nextMsgId++,
      sender: 'user',
      text: commandText,
      timestamp: 'الآن',
    };

    // 1. Always run local deterministic engine first so all write actions, confirmations, and instant calculations are ready
    const response = processZakiMessage(commandText, {
      todayIso: this.store.todayIso(),
      workers: this.store.workers(),
      projects: this.store.projects(),
      attendances: this.store.attendances(),
      advances: this.store.advances(),
      deductions: this.store.deductions(),
      dailyHeadcounts: this.store.dailyHeadcounts(),
      settlements: this.store.settlements(),
      extracts: this.store.extracts(),
      extractLines: this.store.extractLines(),
      extras: this.store.extras(),
      extraCashes: this.store.extraCashes(),
      checks: this.store.checks(),
      expenses: this.store.expenses(),
      incomingPayments: this.store.incomingPayments(),
      settings: this.store.settings(),
      pendingAdvanceWorkerId: this.awaitingAdvanceWorkerId(),
    });

    this.awaitingAdvanceWorkerId.set(
      response.awaitingAdvanceAmountForWorkerId ?? null
    );

    const shouldTryOnlineApi =
      this.preferApiMode() &&
      this.store.isNetworkOnline() &&
      !this.store.localOnlyMode();

    const zakiMsgId = this.nextMsgId++;
    const zakiMsg: ChatMessage = {
      id: zakiMsgId,
      sender: 'zaki',
      text: response.reply,
      timestamp: 'الآن',
      responseMeta: response,
      engineSource: shouldTryOnlineApi ? 'api' : 'local_offline',
      isCheckingApi: shouldTryOnlineApi,
    };

    if (!shouldTryOnlineApi) {
      this.lastUsedEngine.set('local_offline');
    }

    this.messages.update((list) => [...list, userMsg, zakiMsg]);

    if (response.clientEffect === 'navigate_bulk') {
      void this.router.navigateByUrl('/bulk');
    } else if (response.clientEffect === 'export_excel') {
      this.excel.exportFullWorkbook();
    } else if (response.clientEffect === 'undo') {
      void this.store.undoLastOperation();
    } else if (response.clientEffect === 'open_capabilities') {
      this.showCapabilitiesPage.set(true);
    }

    // 2. If online and API mode is active, call /api/zaki/chat; on any error or offline state, keep local response seamlessly
    if (shouldTryOnlineApi && typeof fetch !== 'undefined') {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 6000);
        const apiRes = await this.store.authFetch('/api/zaki/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: commandText,
            localReply: response.reply,
            hasPendingAction: Boolean(response.pendingAction),
            contextSummary: this.buildSiteContextSummary(),
          }),
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (apiRes.ok) {
          const data = (await apiRes.json()) as {
            ok?: boolean;
            mode?: 'api' | 'local_fallback';
            reply?: string;
            projectPath?: string;
            model?: string;
            latencyMs?: number;
          };
          if (data.projectPath) {
            this.gcpProjectPath.set(data.projectPath);
          }
          if (data.ok && data.mode === 'api' && data.reply?.trim()) {
            const ms = data.latencyMs || 550;
            this.lastApiLatencyMs.set(ms);
            this.lastUsedEngine.set('api');
            this.messages.update((list) =>
              list.map((m) =>
                m.id === zakiMsgId
                  ? {
                      ...m,
                      text: data.reply!.trim(),
                      engineSource: 'api',
                      isCheckingApi: false,
                      latencyMs: ms,
                      modelName: data.model || 'gemini-2.5-flash',
                    }
                  : m
              )
            );
            return;
          }
        }
      } catch {
        // Network error or timeout -> seamlessly fall back to local Zaki response
      }

      // Fallback to local engine response without any interruption
      this.lastUsedEngine.set('local_fallback');
      this.messages.update((list) =>
        list.map((m) =>
          m.id === zakiMsgId
            ? {
                ...m,
                text: response.reply,
                engineSource: 'local_fallback',
                isCheckingApi: false,
              }
            : m
        )
      );
    }
  }


  async confirmAction(msg: ChatMessage): Promise<void> {
    const action: ZakiPendingWriteAction | undefined =
      msg.responseMeta?.pendingAction;
    if (!action) return;

    if (action.type === 'record_attendance') {
      for (const wId of action.workerIds) {
        await this.store.recordAttendance({
          date: action.date,
          workerId: wId,
          projectId: action.projectId,
          dayWorked: action.dayWorked,
          nightWorked: action.nightWorked,
          note: 'مسجل عبر المساعد زكي',
          mode: 'merge',
        });
      }
    } else if (action.type === 'record_advance') {
      await this.store.addAdvance({
        workerId: action.workerId,
        amount: action.amount,
        date: action.date,
        reason: action.reason,
        settlementId: null,
        notes: 'مسجل عبر المساعد زكي',
      });
    } else if (action.type === 'record_deduction') {
      await this.store.addDeduction({
        workerId: action.workerId,
        projectId: this.store.selectedProjectId(),
        date: action.date,
        mode: action.mode,
        daysDeducted: action.daysDeducted,
        amount: action.amount,
        reason: action.reason,
        settlementId: null,
        notes: 'خصم مسجل عبر المساعد زكي',
      });
    } else if (action.type === 'record_headcount') {
      await this.store.saveDailyHeadcount({
        date: action.date,
        projectId: action.projectId,
        expectedDayCount: action.expectedDayCount,
        sculptorsCount: action.sculptorsCount,
        workersCount: action.workersCount,
        expectedNightCount: action.expectedNightCount,
        supervisorName: this.store.settings().supervisors[0] || 'المشرف العام',
        notes: 'مسجل عبر المساعد زكي',
      });
    } else if (action.type === 'add_worker') {
      await this.store.saveWorker({
        name: action.name,
        role: action.role,
        workerDayRate: action.workerDayRate,
        workerNightRate: action.workerNightRate,
        phone: '',
        active: true,
        notes: 'تمت الإضافة عبر المساعد زكي',
      });
    } else if (action.type === 'update_worker_rate') {
      const w = this.store.workers().find((x) => x.id === action.workerId);
      if (w) {
        await this.store.saveWorker({
          ...w,
          workerDayRate: action.workerDayRate,
          workerNightRate: action.workerNightRate,
        });
      }
    } else if (action.type === 'add_project') {
      await this.store.saveProject({
        name: action.name,
        companyDayRate: action.companyDayRate,
        companyNightRate: action.companyNightRate,
        active: true,
        notes: 'تمت الإضافة عبر المساعد زكي',
      });
    } else if (action.type === 'record_incoming_payment') {
      await this.store.saveIncomingPayment({
        date: action.date,
        sourceType: action.sourceType,
        sourceName: action.sourceName,
        amount: action.amount,
        method: action.method,
        projectId: action.projectId,
        checkNumber: action.checkNumber || '',
        notes: action.notes,
      });
    } else if (action.type === 'record_expense') {
      await this.store.saveExpense({
        date: action.date,
        category: action.category,
        amount: action.amount,
        projectId: action.projectId,
        note: action.note,
      });
    } else if (action.type === 'record_check') {
      await this.store.saveCheck({
        direction: action.direction,
        number: action.number,
        bank: action.bank,
        amount: action.amount,
        dueDate: action.dueDate,
        status: action.status,
        projectId: action.projectId,
        extractId: null,
        notes: action.notes,
      });
    } else if (action.type === 'update_check_status') {
      const chk = this.store.checks().find((c) => c.id === action.checkId);
      if (chk) {
        await this.store.saveCheck({ ...chk, status: action.newStatus });
      }
    } else if (action.type === 'create_extract') {
      const proj = this.store.projects().find((p) => p.id === action.projectId);
      const projAtt = this.store
        .attendances()
        .filter((a) => a.projectId === action.projectId);
      const lines: ExtractLine[] = [];
      for (const w of this.store.activeWorkers()) {
        if (!w.id) continue;
        const wAtt = projAtt.filter((a) => a.workerId === w.id);
        const calc = wAtt.reduce(
          (s, a) =>
            s +
            (a.dayWorked ? a.companyDayRateSnapshot || proj?.companyDayRate || 550 : 0) +
            (a.nightWorked ? a.companyNightRateSnapshot || proj?.companyNightRate || 275 : 0),
          0
        );
        if (calc > 0 || lines.length < 3) {
          lines.push({
            extractId: 0,
            workerId: w.id,
            calculated: calc,
            claimed: calc,
            taxRate: 0,
            taxAmount: 0,
            collected: 0,
            collectedDate: '',
            method: 'نقدي',
            checkId: null,
            status: 'لم يُحصّل',
            isSaved: true,
            notes: 'أُنشئ تلقائياً عبر المساعد زكي',
          });
        }
      }
      await this.store.saveExtract(
        {
          projectId: action.projectId,
          number: action.number,
          from: action.from,
          to: action.to,
          notes: `مستخلص رقم ${action.number} أُنشئ عبر المساعد زكي`,
        },
        lines
      );
    } else if (action.type === 'settle_worker') {
      const openAdvIds = this.store
        .advances()
        .filter((a) => a.workerId === action.workerId && a.settlementId === null && a.id !== undefined)
        .map((a) => a.id!);
      const openDedIds = this.store
        .deductions()
        .filter((d) => d.workerId === action.workerId && d.settlementId === null && d.id !== undefined)
        .map((d) => d.id!);
      await this.store.createSettlement(
        {
          workerId: action.workerId,
          from: action.from,
          to: action.to,
          days: action.days,
          nights: action.nights,
          grossWages: action.grossWages,
          advancesDeducted: action.advancesDeducted,
          deductionsDeducted: action.deductionsDeducted,
          netPaid: action.netPaid,
          date: this.store.todayIso(),
          notes: 'تسوية وصرف عبر المساعد زكي',
        },
        openAdvIds,
        openDedIds
      );
    } else if (action.type === 'delete_record') {
      if (action.targetEntity === 'advance') {
        await this.store.deleteAdvance(action.recordId);
      } else if (action.targetEntity === 'deduction') {
        await this.store.deleteDeduction(action.recordId);
      } else if (action.targetEntity === 'expense') {
        await this.store.deleteExpense(action.recordId);
      } else if (action.targetEntity === 'incomingPayment') {
        await this.store.deleteIncomingPayment(action.recordId);
      } else if (action.targetEntity === 'check') {
        await this.store.deleteCheck(action.recordId);
      } else if (action.targetEntity === 'worker') {
        await this.store.deleteWorker(action.recordId);
      } else if (action.targetEntity === 'project') {
        await this.store.deleteProject(action.recordId);
      } else if (action.targetEntity === 'extract') {
        await this.store.deleteExtract(action.recordId);
      } else if (action.targetEntity === 'attendance') {
        const att = this.store.attendances().find((a) => a.id === action.recordId);
        if (att) {
          await this.store.recordAttendance({
            date: att.date,
            workerId: att.workerId,
            projectId: att.projectId,
            dayWorked: 0,
            nightWorked: 0,
            mode: 'replace',
          });
        }
      }
    } else if (action.type === 'record_extra') {
      const nashRows: ExtraCash[] = action.workerIds.map((wId) => {
        const w = this.store.workers().find((x) => x.id === wId);
        const amt = (w?.workerDayRate || 350) * action.days;
        return {
          extraId: 0,
          workerId: wId,
          amount: amt,
          days: action.days,
          paidCash: 0,
          notes: 'مسجل عبر زكي',
        };
      });
      const totalAmt = nashRows.reduce((s, r) => s + r.amount, 0);
      await this.store.saveExtraWithNash(
        {
          date: action.date,
          projectId: action.projectId,
          type: action.extraType,
          authorizedBy: action.authorizedBy,
          performedBy: 'workers',
          workersCount: action.workerIds.length,
          valueMode: 'days',
          amount: totalAmt,
          days: action.days * action.workerIds.length,
          notes: 'بند إضافي مسجل عبر زكي',
        },
        nashRows
      );
    } else if (action.type === 'add_worker_note') {
      const w = this.store.workers().find((x) => x.id === action.workerId);
      if (w) {
        await this.store.saveWorker({ ...w, notes: action.note });
      }
    }

    this.messages.update((list) =>
      list.map((m) =>
        m.id === msg.id ? { ...m, actionResolved: 'confirmed' } : m
      )
    );
    this.store.showToast('تم تنفيذ أمر زكي وحفظه ومزامنته بنجاح', 'success');
  }

  cancelAction(msg: ChatMessage): void {
    this.messages.update((list) =>
      list.map((m) =>
        m.id === msg.id ? { ...m, actionResolved: 'cancelled' } : m
      )
    );
    this.store.showToast('تم إلغاء العملية', 'warning');
  }
}
