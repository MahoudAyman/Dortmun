import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  ViewChild,
} from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import { formatCurrency } from '../../core/calc/calculations';
import {
  ZAKI_CAPABILITIES_GUIDE,
  processZakiMessage,
  type ZakiPendingWriteAction,
  type ZakiResponse,
} from '../../core/chat/zaki-engine';
import { custodianLabel, type ExtraCash, type ExtractLine } from '../../core/db/models';

interface ChatMessage {
  id: number;
  sender: 'user' | 'zaki';
  text: string;
  timestamp: string;
  responseMeta?: ZakiResponse;
  actionResolved?: 'confirmed' | 'cancelled';
  executedRef?: { kind: 'transfer' | 'advance' | 'expense' | 'incoming' | 'check'; id: number };
  // ملخص «اللي تم» بعد التنفيذ: جملة واحدة بالأرقام الجديدة (رصيد بعد العملية).
  executedSummary?: string;
  actionUndone?: boolean;
  engineSource?: 'api' | 'local_offline' | 'local_fallback';
  isCheckingApi?: boolean;
  latencyMs?: number;
  modelName?: string;
  // مزود الـ AI اللي رد فعلاً (Apinex أولاً، Gemini احتياطي) — يظهر في الشارة.
  provider?: 'apinex' | 'gemini';
}

@Component({
  selector: 'app-zaki-page',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto flex flex-col gap-3.5 sm:gap-4 pb-8 polite-enter">
      <!-- Slim header: avatar + name + one honest verified status pill -->
      <div
        class="ceramic-card polite-card rounded-2xl p-3 sm:p-4 flex flex-col gap-2.5 relative overflow-hidden"
      >
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 relative z-10">
          <div class="flex items-center gap-3">
            <div
              class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-[#2563EB] text-white flex items-center justify-center shadow-sm shrink-0 border border-blue-400/30 polite-icon-badge"
            >
              <mat-icon class="!w-6 !h-6 !text-[24px]">smart_toy</mat-icon>
            </div>
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h2 class="text-base sm:text-lg font-black text-[var(--text-heading)]">
                  المساعد الذكي «زكي»
                </h2>
                @if (apiStatus() === 'connected') {
                  <span
                    class="px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 text-[10px] font-black inline-flex items-center gap-1.5"
                  >
                    <span class="w-2 h-2 rounded-full bg-emerald-500 polite-dot"></span>
                    <span>متصل بـ {{ lastProvider() === 'apinex' ? 'Apinex' : 'Gemini' }} ✓@if (lastApiLatencyMs() > 0) { · {{ lastApiLatencyMs() }}ms }</span>
                  </span>
                } @else if (apiStatus() === 'unavailable') {
                  <span
                    class="px-2.5 py-0.5 rounded-lg bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-400/40 text-[10px] font-black inline-flex items-center gap-1"
                  >
                    <span class="w-2 h-2 rounded-full bg-amber-500"></span>
                    <span>محلي — الـ API غير متوفر</span>
                  </span>
                } @else {
                  <span
                    class="px-2.5 py-0.5 rounded-lg bg-slate-500/15 text-slate-600 dark:text-slate-300 border border-slate-500/30 text-[10px] font-black inline-flex items-center gap-1.5"
                  >
                    <span class="w-2 h-2 rounded-full bg-slate-400 polite-dot"></span>
                    <span>بيفحص اتصال الـ AI...</span>
                  </span>
                }
              </div>
              <p class="text-[11px] sm:text-xs text-[var(--text-secondary)] mt-0.5">
                اسأل بالعامية المصرية — أسجّل الفلوس والعدد والسلف، وأحسبلك حسابك. {{ engineStatusLabel() }}
              </p>
            </div>
          </div>

          <!-- One visible toolbar: every control in plain sight, no hidden menu -->
          <div class="flex flex-wrap items-center gap-1.5 relative">
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
              <span>{{ preferApiMode() ? 'وضع API' : 'محلي فقط' }}</span>
            </button>

            <!-- Copy whole chat -->
            <button
              type="button"
              (click)="copyChatHistory()"
              class="polite-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer border bg-[var(--bg-surface-muted)] text-[var(--text-heading)] border-[var(--border-subtle)] hover:bg-[var(--color-primary-soft)]"
              title="نسخ سجل المحادثة كاملاً"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">content_copy</mat-icon>
              <span>نسخ الشات</span>
            </button>

            <!-- Clear chat -->
            <button
              type="button"
              (click)="clearChat()"
              class="polite-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-bold text-xs cursor-pointer border bg-rose-500/10 text-rose-600 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20"
              title="مسح المحادثة وبدء صفحة جديدة"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">refresh</mat-icon>
              <span>شات جديد</span>
            </button>

            <!-- Capabilities guide -->
            <button
              type="button"
              (click)="showCapabilitiesPage.set(!showCapabilitiesPage())"
              class="polite-btn inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-extrabold text-xs cursor-pointer shadow-xs"
              [class]="
                showCapabilitiesPage()
                  ? 'bg-emerald-600 text-white'
                  : 'bg-[#2563EB] hover:bg-blue-700 text-white'
              "
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">menu_book</mat-icon>
              <span>{{ showCapabilitiesPage() ? 'العودة للشات' : 'ماذا يقدر يعمل؟' }}</span>
            </button>
          </div>
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

      <!-- Quick commands: one scrollable row, no big card -->
      <div class="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        @for (cmd of quickChips; track cmd) {
          <button
            type="button"
            (click)="runCommand(cmd)"
            class="shrink-0 px-3 py-1.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] hover:bg-amber-500 hover:text-slate-950 hover:border-amber-500 text-[var(--text-heading)] text-[11px] font-bold transition-colors cursor-pointer"
          >
            {{ cmd }}
          </button>
        }
      </div>

      <!-- Chat Messages Stream -->
      <div
        #chatScroll
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
                    🌐 عبر {{ msg.provider === 'apinex' ? 'Apinex · GPT-6 Luna' : 'Gemini · 2.5 Flash' }}{{ msg.provider === 'gemini' ? ' (' + gcpProjectPath() + ')' : '' }}{{ msg.latencyMs ? ' · ' + msg.latencyMs + 'ms' : '' }}
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
              <!-- الرد المنظم: أقسام «المطلوب / اللي هيتم / اللي تم» في بلوكات
                   ملوّنة، وأي نص بلا عناوين يظهر عادي زي ما كان. -->
              @if (sectionsOf(msg.text); as secs) {
                @if (secs.restBefore) {
                  <div>{{ secs.restBefore }}</div>
                }
                @if (secs.requested) {
                  <div class="mt-1.5 rounded-xl bg-blue-500/10 border border-blue-500/30 px-3 py-2">
                    <div class="text-[11px] font-black text-[#2563EB] dark:text-blue-300 mb-0.5">🎯 المطلوب</div>
                    <div class="whitespace-pre-line">{{ secs.requested }}</div>
                  </div>
                }
                @if (secs.willHappen) {
                  <div class="mt-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 px-3 py-2">
                    <div class="text-[11px] font-black text-amber-700 dark:text-amber-300 mb-0.5">📋 اللي هيتم</div>
                    <div class="whitespace-pre-line">{{ secs.willHappen }}</div>
                  </div>
                }
                @if (secs.done) {
                  <div class="mt-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2">
                    <div class="text-[11px] font-black text-emerald-700 dark:text-emerald-300 mb-0.5">✅ اللي تم</div>
                    <div class="whitespace-pre-line">{{ secs.done }}</div>
                  </div>
                }
                @if (secs.restAfter) {
                  <div class="mt-1.5">{{ secs.restAfter }}</div>
                }
              } @else {
                {{ msg.text }}
              }


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

              <!-- Confirmation Card for Write Actions: what will change + before/after -->
              @if (
                msg.responseMeta?.requiresConfirmation &&
                msg.responseMeta?.pendingAction &&
                !msg.actionResolved
              ) {
                <div class="mt-3 pt-3 border-t border-[var(--border-subtle)]">
                  <div class="rounded-xl bg-amber-500/10 border border-amber-500/40 p-3 flex flex-col gap-2">
                    <div class="text-xs font-black text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
                      <mat-icon class="!w-4 !h-4 !text-[16px]">help_outline</mat-icon>
                      <span>هل توافق على التنفيذ؟</span>
                    </div>
                    <div class="text-xs font-bold text-[var(--text-heading)]">
                      {{ actionSummaryLine(msg.responseMeta!.pendingAction!) }}
                    </div>
                    @if (actionBalancePreview(msg.responseMeta!.pendingAction!); as preview) {
                      <div class="flex flex-col gap-1">
                        @for (row of preview; track row.label) {
                          <div class="text-[11px] font-bold text-[var(--text-secondary)]">
                            {{ row.label }}: قبل {{ fmt(row.before) }} · بعد {{ fmt(row.after) }}
                          </div>
                        }
                      </div>
                    }
                    <div class="flex flex-wrap items-center gap-2 pt-1">
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
                  </div>
                </div>
              }

              @if (msg.actionResolved === 'confirmed') {
                <div
                  class="mt-2 text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">verified</mat-icon>
                  <span>تم التنفيذ والحفظ والمزامنة بنجاح ✓</span>
                </div>
                @if (msg.executedSummary) {
                  <div class="mt-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30 px-3 py-2 text-xs font-bold text-[var(--text-heading)]">
                    <span class="font-black text-emerald-700 dark:text-emerald-300">✅ اللي تم: </span>{{ msg.executedSummary }}
                  </div>
                }
                @if (msg.executedRef && !msg.actionUndone) {
                  <div class="mt-2">
                    <button
                      type="button"
                      (click)="undoExecuted(msg)"
                      class="px-3 py-1.5 rounded-xl bg-slate-500/10 text-slate-600 dark:text-slate-300 border border-slate-400/40 text-xs font-bold flex items-center gap-1 cursor-pointer hover:bg-slate-500/20"
                    >
                      <mat-icon class="!w-4 !h-4 !text-[16px]">undo</mat-icon>
                      <span>تراجع عن العملية</span>
                    </button>
                  </div>
                }
                @if (msg.actionUndone) {
                  <div
                    class="mt-2 text-xs font-bold text-slate-500 flex items-center gap-1"
                  >
                    <mat-icon class="!w-4 !h-4 !text-[16px]">history</mat-icon>
                    <span>تم التراجع عن العملية ورجعت الأرصدة زي ما كانت</span>
                  </div>
                }
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

      <!-- Input & Voice Bar (sticky: stays visible at the bottom while the chat scrolls) -->
      <div
        class="ceramic-card rounded-2xl p-2.5 sm:p-3 flex items-center gap-2 sticky bottom-0 z-20 bg-[var(--bg-card)] shadow-lg"
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
          placeholder="اكتب لزكي بالعامية... مثلاً: وصلني 50000 من شركة إعمار"
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

  // ── Zaki chat persistence (localStorage, cap 200 messages) ──
  private static readonly CHAT_STORAGE_KEY = 'dortmun_zaki_chat_v1';
  private static readonly CHAT_MAX_MESSAGES = 200;

  @ViewChild('chatScroll') private chatScroll?: ElementRef<HTMLElement>;

  constructor() {
    // Persist whenever the in-memory messages signal changes (any append,
    // API reply replacement, confirmation or clear). The signal stays the
    // source of truth; localStorage is only a restore cache.
    effect(() => {
      this.saveChatMessages(this.messages());
    });
    // Scroll to the newest message once the restored history is rendered.
    this.scrollChatToBottom();
    // One silent verified check on open, so the header pill tells the
    // truth (connected / unavailable) instead of assuming the API works.
    setTimeout(() => {
      if (
        this.preferApiMode() &&
        this.store.isNetworkOnline() &&
        !this.store.localOnlyMode()
      ) {
        void this.testApiConnectionNow(true);
      } else {
        this.apiStatus.set('unavailable');
        this.apiStatusNote.set(
          this.store.localOnlyMode() ? 'الوضع المحلي مفعّل' : 'مفيش إنترنت'
        );
      }
    }, 600);
  }

  private loadSavedMessages(): ChatMessage[] | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(ZakiPage.CHAT_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed) || parsed.length === 0) return null;
      const saved = (parsed as ChatMessage[]).filter(
        (m) => m && typeof m.text === 'string' && (m.sender === 'user' || m.sender === 'zaki')
      );
      if (saved.length === 0) return null;
      const capped = saved.slice(-ZakiPage.CHAT_MAX_MESSAGES);
      const maxId = capped.reduce((s, m) => Math.max(s, m.id || 0), 0);
      if (maxId >= this.nextMsgId) this.nextMsgId = maxId + 1;
      return capped;
    } catch {
      return null;
    }
  }

  private saveChatMessages(list: ChatMessage[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        ZakiPage.CHAT_STORAGE_KEY,
        JSON.stringify(list.slice(-ZakiPage.CHAT_MAX_MESSAGES))
      );
    } catch {
      // Storage full/blocked (private mode): chat keeps working in memory.
    }
  }

  private scrollChatToBottom(): void {
    setTimeout(() => {
      const el = this.chatScroll?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    }, 0);
  }

  readonly capabilitiesGuide = ZAKI_CAPABILITIES_GUIDE;
  readonly showCapabilitiesPage = signal<boolean>(false);
  readonly preferApiMode = signal<boolean>(true);
  readonly lastUsedEngine = signal<'api' | 'local_offline' | 'local_fallback'>('api');
  // آخر مزود AI رد فعلاً (Apinex أولاً، Gemini احتياطي) — يظهر في الشارة
  // والترويسة بدل اسم ثابت، عشان المستخدم يعرف مين اللي بيرد عليه.
  readonly lastProvider = signal<'apinex' | 'gemini'>('gemini');
  readonly gcpProjectPath = signal<string>('projects/110645591699');
  // No fake default: 0 means "no verified check yet". The header only
  // claims an API connection after a real /api/zaki/status ping succeeds.
  readonly lastApiLatencyMs = signal<number>(0);
  // Verified API state: 'unknown' until the first real check runs,
  // then 'connected' or 'unavailable' (with a plain-language reason).
  readonly apiStatus = signal<'unknown' | 'connected' | 'unavailable'>('unknown');
  readonly apiStatusNote = signal<string>('');
  readonly isTestingApi = signal<boolean>(false);

  readonly engineStatusLabel = computed(() => {
    if (!this.store.isNetworkOnline() || this.store.localOnlyMode()) {
      return 'محرك زكي المحلي الفوري (بدون إنترنت)';
    }
    if (!this.preferApiMode()) {
      return 'محرك زكي المحلي المباشر (تم اختياره يدوياً)';
    }
    if (this.apiStatus() === 'connected') {
      return this.lastProvider() === 'apinex'
        ? 'متصل بـ Apinex (GPT-6 Luna) — و Gemini احتياطي تلقائي'
        : 'متصل بـ Gemini 2.5 Flash API (projects/110645591699) — و Apinex أولاً';
    }
    if (this.apiStatus() === 'unavailable') {
      return `محلي — الـ API غير متوفر (${this.apiStatusNote() || 'غير معروف'})`;
    }
    return 'بيفحص اتصال الـ AI...';
  });

  readonly inputCtrl = new FormControl('', { nonNullable: true });
  readonly isListening = signal<boolean>(false);
  readonly awaitingAdvanceWorkerId = signal<number | null>(null);
  private nextMsgId = 2;

  readonly quickChips = [
    'حسابي الشامل كام؟ وصلني كام وليا كام وعليا كام؟',
    'قارن ربحية المشاريع',
    'أرصدة الأمناء',
    'محمود أيمن معاه كام؟',
    'تقرير اليوم',
    'تنبيهات',
    'سحبت 5000 من فودافون للجيب',
    'تصدير الإكسل',
  ];

  readonly messages = signal<ChatMessage[]>(this.loadSavedMessages() ?? [
    {
      id: 1,
      sender: 'zaki',
      text:
        'أهلاً بيك يا باشمهندس! أنا «زكي» دراعك اليمين بالعامية المصرية 👷‍♂️\n' +
        '• أسجل الفلوس اللي وصلتك (شيكات أو من شركة أو من شخص) وأقولك راحت لحساب مشروع إيه، واتصرف كام سلف وقبض، وليك كام وعليك كام وصافي ربحك.\n' +
        '• أسجل العدد اليومي الإجباري، أحضر العمال والنحاتية، أصرف سلف، أوقع خصومات، أعمل مستخلصات، وأصرف شيكات — وأقدر كمان أمسح سجل أو أعدّل يومية عامل وحالة شيك، وبعد موافقتك أقولك بالظبط اللي تم.\n' +
        '• كل رد مني منظم في 3 أقسام: 🎯 المطلوب، 📋 اللي هيتم، ✅ اللي تم — وكل عملية ليها أزرار تأكيد وإلغاء وتراجع.\n' +
        '• هفحص اتصال الـ AI دلوقتي (Apinex أولاً، و Gemini احتياطي تلقائي)، ولو الاتنين مش متوفرين هرد عليك من المحرك المحلي فوراً من غير ما تقف.\n' +
        'جرّب أي أمر من الاختصارات تحت، أو اكتبلي بالعامية زي ما بتتكلم!',
      timestamp: 'الآن',
    },
  ]);

  async testApiConnectionNow(silent = false): Promise<void> {
    if (this.isTestingApi() || typeof fetch === 'undefined') return;
    this.isTestingApi.set(true);
    const failNote = (
      status?: string,
      reason?: string,
      geminiStatus?: number,
      geminiError?: string
    ): string => {
      if (status === 'no_key') return 'المفتاح مش متسجل على المنصة دي';
      if (geminiStatus === 400) return 'Google رفض المفتاح (خطأ 400) — المفتاح مش صالح أو اتلغى';
      if (geminiStatus === 401 || geminiStatus === 403)
        return 'Google رفض المفتاح (خطأ ' + geminiStatus + ') — المفتاح ممنوع أو الـ API مش مفعّل للمشروع ده';
      if (geminiStatus === 404) return 'الموديل مش موجود على Google (خطأ 404)';
      if (geminiStatus === 429) return 'تجاوزت حد الاستخدام (خطأ 429) — جرّب بعد شوية';
      if (geminiStatus === 0) return 'الطلب انتهت مهلته قبل ما Gemini يرد';
      if (geminiStatus && geminiStatus > 0)
        return `Google رد بخطأ ${geminiStatus}${geminiError ? ' — ' + geminiError : ''}`;
      if (reason) return reason;
      return 'الـ API مش بيرد دلوقتي';
    };
    const reportFailure = (note: string): void => {
      this.apiStatus.set('unavailable');
      this.apiStatusNote.set(note);
      this.lastUsedEngine.set('local_fallback');
      if (silent) return;
      this.messages.update((list) => [
        ...list,
        {
          id: this.nextMsgId++,
          sender: 'zaki',
          text: `⚠️ فحص اتصال الـ AI: غير متوفر دلوقتي.\n• السبب: ${note}.\n• هكمل معاك من المحرك المحلي عادي، وجرّب «فحص اتصال الـ AI» تاني بعد ما تتأكد من المفتاح والمنصة.`,
          timestamp: 'الآن',
          engineSource: 'local_fallback',
        },
      ]);
      this.scrollChatToBottom();
      this.store.showToast(`الـ AI غير متوفر: ${note}`, 'warning');
    };
    try {
      const res = await this.store.authFetch('/api/zaki/status?ping=1');
      if (res.ok) {
        const data = (await res.json()) as {
          ok?: boolean;
          status?: string;
          reason?: string;
          geminiStatus?: number;
          geminiError?: string;
          projectPath?: string;
          model?: string;
          provider?: 'apinex' | 'gemini';
          latencyMs?: number;
          sampleReply?: string;
        };
        if (data.projectPath) {
          this.gcpProjectPath.set(data.projectPath);
        }
        if (data.ok) {
          const ms = data.latencyMs || 0;
          this.lastApiLatencyMs.set(ms);
          this.lastProvider.set(data.provider === 'apinex' ? 'apinex' : 'gemini');
          this.apiStatus.set('connected');
          this.apiStatusNote.set('');
          this.lastUsedEngine.set('api');
          this.preferApiMode.set(true);
          if (silent) return;
          this.messages.update((list) => [
            ...list,
            {
              id: this.nextMsgId++,
              sender: 'zaki',
              text: `✅ فحص اتصال الـ AI API ناجح ١٠٠٪!\n• المزود النشط: ${data.provider === 'apinex' ? 'Apinex (GPT-6 Luna)' : 'Gemini 2.5 Flash'}${data.provider === 'apinex' ? ' — و Gemini احتياطي تلقائي' : ''}\n• المشروع المتصل: ${data.projectPath || 'projects/110645591699'}\n• النموذج النشط: ${data.model || 'gemini-2.5-flash'}\n• زمن الاستجابة الفعلي: ${ms} مللي ثانية\n• رسالة الاختبار من الخادم: «${data.sampleReply || 'متصل وجاهز يا باشمهندس'}»`,
              timestamp: 'الآن',
              engineSource: 'api',
              latencyMs: ms,
              modelName: data.model || 'gemini-2.5-flash',
              provider: data.provider === 'apinex' ? 'apinex' : 'gemini',
            },
          ]);
          this.scrollChatToBottom();
          this.store.showToast(
            `اتصال الذكاء الاصطناعي (${data.projectPath || 'projects/110645591699'}) يعمل بنجاح (${ms}ms)`,
            'success'
          );
          return;
        }
        reportFailure(failNote(data.status, data.reason, data.geminiStatus, data.geminiError));
        return;
      }
      reportFailure('الخادم رد بخطأ (غير مصرح أو غير متوفر)');
    } catch {
      reportFailure('مفيش اتصال بالخادم');
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
        engineSource: this.apiStatus() === 'connected' ? 'api' : 'local_offline',
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
      `أرصدة الأمناء (فودافون كاش / جيب): ${this.store.custodianBalances().balances.map((b) => `${b.name}: فودافون ${b.vodafoneBalance} ج.م، جيب ${b.pocketBalance} ج.م`).join(' | ') || 'لا يوجد بعد'}`,
      // أحدث السجلات بأرقامها — عشان الـ AI يقدر يقترح حذف أو تعديل سجل
      // محدد بالرقم (delete_record / update_check_status) بدل ما يخمن.
      `أحدث السلف (رقم: عامل — مبلغ — تاريخ): ${this.store.advances().slice(-5).map((a) => `#${a.id}: ${this.store.workers().find((w) => w.id === a.workerId)?.name || 'عامل'} — ${a.amount} ج.م — ${a.date}`).join(' | ') || 'لا يوجد'}`,
      `أحدث المصاريف (رقم: تصنيف — مبلغ — تاريخ): ${this.store.expenses().slice(-5).map((e) => `#${e.id}: ${e.category} — ${e.amount} ج.م — ${e.date}`).join(' | ') || 'لا يوجد'}`,
      `أحدث الشيكات (رقم: اتجاه — مبلغ — حالة — استحقاق): ${this.store.checks().slice(-5).map((c) => `#${c.id}: ${c.direction} — ${c.amount} ج.م — ${c.status} — ${c.dueDate}`).join(' | ') || 'لا يوجد'}`,
      `أحدث الدفعات الواردة (رقم: مصدر — مبلغ — تاريخ): ${this.store.incomingPayments().slice(-5).map((p) => `#${p.id}: ${p.sourceName} — ${p.amount} ج.م — ${p.date}`).join(' | ') || 'لا يوجد'}`,
    ].join('\n');
  }

  // يحوّل الـ action اللي رجّعته الـ API (JSON من Gemini) لنفس شكل
  // ZakiPendingWriteAction بتاع المحرك المحلي، بعد تحقق صارم من كل حقل.
  // أي حقل مش مفهوم أو مش موجود → null (الرد النصي بس اللي يظهر،
  // وبطاقة التأكيد المحلية — لو موجودة — تفضل زي ما هي).
  private mapApiAction(raw: unknown): ZakiPendingWriteAction | null {
    if (!raw || typeof raw !== 'object') return null;
    const a = raw as Record<string, unknown>;
    const type = typeof a['type'] === 'string' ? (a['type'] as string) : '';
    const amount = typeof a['amount'] === 'number' && (a['amount'] as number) > 0 ? (a['amount'] as number) : 0;
    const fee =
      typeof a['withdrawalFee'] === 'number' && (a['withdrawalFee'] as number) > 0
        ? (a['withdrawalFee'] as number)
        : 0;
    const today = this.store.todayIso();
    const resolveCustodian = (v: unknown): 'mahmoud_ayman' | 'mahmoud_hamada' | 'ayman_hassan' | null => {
      if (v === 'mahmoud_ayman' || v === 'mahmoud_hamada' || v === 'ayman_hassan') return v;
      if (typeof v === 'string') {
        const t = v.trim();
        if (t.includes('حماده')) return 'mahmoud_hamada';
        if (t.includes('حسان')) return 'ayman_hassan';
        if (t.includes('ايمن')) return 'mahmoud_ayman';
      }
      return null;
    };
    if (type === 'record_pocket_withdrawal') {
      const custodian = resolveCustodian(a['custodian']) || 'mahmoud_ayman';
      if (!amount) return null;
      return { type: 'record_pocket_withdrawal', custodian, amount, withdrawalFee: fee, date: today, notes: 'سحب جيب مسجل عبر المساعد زكي' };
    }
    if (type === 'record_custodian_transfer') {
      const from = resolveCustodian(a['fromCustodian']);
      const to = resolveCustodian(a['toCustodian']);
      if (!amount || !from || !to || from === to) return null;
      return { type: 'record_custodian_transfer', fromCustodian: from, toCustodian: to, amount, withdrawalFee: fee, method: 'فودافون كاش', date: today, notes: 'تحويل مسجل عبر المساعد زكي' };
    }
    if (type === 'record_advance') {
      if (!amount || typeof a['workerName'] !== 'string') return null;
      const name = (a['workerName'] as string).trim();
      const worker = this.store.workers().find((w) => w.name.trim() === name) ||
        this.store.workers().find((w) => name.includes(w.name.trim()) || w.name.trim().includes(name));
      if (!worker || worker.id === undefined) return null;
      const fundedBy = resolveCustodian(a['fundedBy']) || 'mahmoud_ayman';
      const paidFrom = a['paidFrom'] === 'vodafone' ? 'vodafone' : 'pocket';
      return { type: 'record_advance', workerId: worker.id, workerName: worker.name, amount, date: today, reason: 'سلفة عبر زكي', fundedBy, paidFrom };
    }
    if (type === 'record_expense') {
      if (!amount) return null;
      const cats = ['مواصلات', 'أكل', 'أدوات', 'صيانة', 'رسوم سحب شيك', 'أخرى'] as const;
      const category = cats.includes(a['category'] as never) ? (a['category'] as (typeof cats)[number]) : 'أخرى';
      return { type: 'record_expense', date: today, category, amount, projectId: null, projectName: '', note: typeof a['note'] === 'string' ? (a['note'] as string) : 'مصروف مسجل عبر زكي' };
    }
    if (type === 'record_incoming_payment') {
      if (!amount || typeof a['sourceName'] !== 'string') return null;
      const sourceTypes = ['شركة', 'شخص', 'شيك', 'مستخلص', 'أخرى'] as const;
      const sourceType = sourceTypes.includes(a['sourceType'] as never) ? (a['sourceType'] as (typeof sourceTypes)[number]) : 'شخص';
      const methods = ['نقدي', 'تحويل بنكي', 'إنستا باي / محفظة', 'محفظة إلكترونية', 'شيك'] as const;
      const method = methods.includes(a['method'] as never) ? (a['method'] as (typeof methods)[number]) : 'محفظة إلكترونية';
      return { type: 'record_incoming_payment', date: today, sourceType, sourceName: a['sourceName'] as string, amount, method, projectId: null, projectName: '', notes: 'دفعة واردة مسجلة عبر زكي' };
    }
    if (type === 'record_check') {
      if (!amount) return null;
      const direction = a['direction'] === 'صادر' ? 'صادر' : 'وارد';
      const status = a['status'] === 'اتصرف' || a['status'] === 'مرتجع' ? (a['status'] as 'اتصرف' | 'مرتجع') : 'معلق';
      const due = typeof a['dueDate'] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(a['dueDate'] as string) ? (a['dueDate'] as string) : today;
      return { type: 'record_check', direction, number: typeof a['number'] === 'string' ? (a['number'] as string) : '', bank: typeof a['bank'] === 'string' ? (a['bank'] as string) : '', amount, dueDate: due, status, projectId: null, notes: 'شيك مسجل عبر زكي' };
    }
    // الحذف والتعديل: الـ AI بيقترح بس، والتحقق هنا صارم — السجل لازم
    // يكون موجود فعلاً بالرقم اللي في قائمة «أحدث السجلات»، وإلا مفيش
    // بطاقة تأكيد أصلاً (الرد النصي بس اللي يظهر).
    if (type === 'delete_record') {
      const entities = ['worker', 'project', 'attendance', 'advance', 'deduction', 'check', 'expense', 'incomingPayment', 'extract', 'extra'] as const;
      const target = a['targetEntity'];
      const recordId = typeof a['recordId'] === 'number' ? (a['recordId'] as number) : 0;
      if (!entities.includes(target as never) || !recordId || recordId <= 0) return null;
      const exists =
        (target === 'advance' && this.store.advances().some((x) => x.id === recordId)) ||
        (target === 'deduction' && this.store.deductions().some((x) => x.id === recordId)) ||
        (target === 'expense' && this.store.expenses().some((x) => x.id === recordId)) ||
        (target === 'incomingPayment' && this.store.incomingPayments().some((x) => x.id === recordId)) ||
        (target === 'check' && this.store.checks().some((x) => x.id === recordId)) ||
        (target === 'worker' && this.store.workers().some((x) => x.id === recordId)) ||
        (target === 'project' && this.store.projects().some((x) => x.id === recordId)) ||
        (target === 'extract' && this.store.extracts().some((x) => x.id === recordId)) ||
        (target === 'attendance' && this.store.attendances().some((x) => x.id === recordId));
      if (!exists) return null;
      const description = typeof a['description'] === 'string' && (a['description'] as string).trim()
        ? (a['description'] as string).trim()
        : `سجل رقم ${recordId}`;
      return { type: 'delete_record', targetEntity: target as (typeof entities)[number], recordId, description };
    }
    if (type === 'update_worker_rate') {
      const name = typeof a['workerName'] === 'string' ? (a['workerName'] as string).trim() : '';
      const dayRate = typeof a['workerDayRate'] === 'number' ? (a['workerDayRate'] as number) : 0;
      const nightRate = typeof a['workerNightRate'] === 'number' ? (a['workerNightRate'] as number) : 0;
      if (!name || !dayRate || dayRate <= 0 || !nightRate || nightRate <= 0) return null;
      const worker = this.store.workers().find((w) => w.name.trim() === name) ||
        this.store.workers().find((w) => name.includes(w.name.trim()) || w.name.trim().includes(name));
      if (!worker || worker.id === undefined) return null;
      return { type: 'update_worker_rate', workerId: worker.id, workerName: worker.name, workerDayRate: dayRate, workerNightRate: nightRate };
    }
    if (type === 'update_check_status') {
      const checkId = typeof a['checkId'] === 'number' ? (a['checkId'] as number) : 0;
      const newStatus = a['newStatus'];
      if (!checkId || checkId <= 0) return null;
      if (newStatus !== 'معلق' && newStatus !== 'اتصرف' && newStatus !== 'مرتجع') return null;
      const chk = this.store.checks().find((c) => c.id === checkId);
      if (!chk) return null;
      return { type: 'update_check_status', checkId, checkNumber: chk.number || `#${checkId}`, newStatus, amount: chk.amount };
    }
    return null;
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
      custodianTransfers: this.store.custodianTransfers(),
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
    this.scrollChatToBottom();

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
        // مهلة 30 ثانية: سلسلة المزودين Apinex (10ث) + Gemini (15ث) + هوامش.
        const timer = setTimeout(() => controller.abort(), 30000);
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
            action?: unknown;
            projectPath?: string;
            model?: string;
            provider?: 'apinex' | 'gemini';
            latencyMs?: number;
          };
          if (data.projectPath) {
            this.gcpProjectPath.set(data.projectPath);
          }
          if (data.ok && data.mode === 'api' && data.reply?.trim()) {
            const ms = data.latencyMs || 550;
            this.lastApiLatencyMs.set(ms);
            this.lastUsedEngine.set('api');
            const provider = data.provider === 'apinex' ? 'apinex' : 'gemini';
            this.lastProvider.set(provider);
            // الـ API اقترحت عملية منظمة؟ حوّلها لبطاقة تأكيد زي المحلي تماماً.
            // لو مفيش action صالح، بطاقة التأكيد المحلية (لو موجودة) تفضل زي ما هي.
            const apiAction = this.mapApiAction(data.action);
            let replyText = data.reply!.trim();
            // لو الـ API اقترحت سلفة لعامل مش مسجل، وضّح للمستخدم ليه متنفذتش
            // بدل ما يفضل مستني زر تأكيد مش هيظهر.
            if (!apiAction && data.action && typeof data.action === 'object') {
              const rawAction = data.action as Record<string, unknown>;
              if (
                rawAction['type'] === 'record_advance' &&
                typeof rawAction['workerName'] === 'string'
              ) {
                const wName = (rawAction['workerName'] as string).trim();
                const exists = this.store.workers().some(
                  (w) =>
                    w.name.trim() === wName ||
                    wName.includes(w.name.trim()) ||
                    w.name.trim().includes(wName)
                );
                if (!exists) {
                  replyText += `\n\n—\n⚠️ ملاحظة: العامل «${wName}» مش مسجل في قائمة العمال، فالسلفة دي متنفذتش. قولي: هو عامل جديد؟ تخصصه إيه؟ والمشروع اللي اشتغل فيه إيه؟ وأنا أضيفه وأسجل السلفة.`;
                }
              }
            }
            const newMeta = apiAction
              ? { ...response, pendingAction: apiAction, requiresConfirmation: true }
              : response;
            this.messages.update((list) =>
              list.map((m) =>
                m.id === zakiMsgId
                  ? {
                      ...m,
                      text: replyText,
                      responseMeta: newMeta,
                      engineSource: 'api',
                      isCheckingApi: false,
                      latencyMs: ms,
                      modelName: data.model || (provider === 'apinex' ? 'free/gpt-6-luna' : 'gemini-2.5-flash'),
                      provider,
                    }
                  : m
              )
            );
            this.scrollChatToBottom();
            return;
          }
        }
      } catch {
        // Network error or timeout -> seamlessly fall back to local Zaki response
      }

      // Fallback to local engine response without any interruption.
      // Say so honestly in the message itself (the local_fallback badge
      // above the bubble already shows, this note explains why).
      this.lastUsedEngine.set('local_fallback');
      this.messages.update((list) =>
        list.map((m) =>
          m.id === zakiMsgId
            ? {
                ...m,
                text: `${response.reply}\n\n—\n⚠️ تعذّر الوصول إلى AI API الآن، فالرد ده من محرك زكي المحلي.`,
                engineSource: 'local_fallback',
                isCheckingApi: false,
              }
            : m
        )
      );
      this.scrollChatToBottom();
    }
  }


  // يقسّم رد الـ AI لأقسام «المطلوب / اللي هيتم / اللي تم» (عناوين
  // الأقسام يبدأ بها سطر). لو مفيش عناوين، يرجّع null والرسالة تظهر
  // نصاً عادياً زي ما كانت (ردود المحرك المحلي بالنقاط).
  sectionsOf(text: string): {
    requested: string;
    willHappen: string;
    done: string;
    restBefore: string;
    restAfter: string;
  } | null {
    const headerOf = (line: string): 'requested' | 'willHappen' | 'done' | null => {
      const t = line.trim().replace(/^[🎯📋✅📌🔹•\s]+/, '');
      if (/^المطلوب\s*[:：\-–]?\s*/.test(t)) return 'requested';
      if (/^الل[يى]\s*ه[يى]تم\s*[:：\-–]?\s*/.test(t)) return 'willHappen';
      if (/^الل[يى]\s*تم\s*[:：\-–]?\s*/.test(t)) return 'done';
      return null;
    };
    const stripHeader = (line: string): string =>
      line.trim().replace(/^[🎯📋✅📌🔹•\s]+/, '').replace(/^(المطلوب|الل[يى]\s*ه[يى]تم|الل[يى]\s*تم)\s*[:：\-–]?\s*/, '');
    const lines = text.split('\n');
    let current: 'requested' | 'willHappen' | 'done' | null = null;
    let seenHeader = false;
    const parts = { requested: '', willHappen: '', done: '', restBefore: '', restAfter: '' };
    const buckets: Record<string, string[]> = { requested: [], willHappen: [], done: [], restBefore: [], restAfter: [] };
    for (const line of lines) {
      const h = headerOf(line);
      if (h) {
        seenHeader = true;
        current = h;
        const rest = stripHeader(line);
        if (rest) buckets[h].push(rest);
        continue;
      }
      if (!seenHeader) {
        buckets['restBefore'].push(line);
      } else if (current) {
        buckets[current].push(line);
      } else {
        buckets['restAfter'].push(line);
      }
    }
    if (!seenHeader) return null;
    parts.requested = buckets['requested'].join('\n').trim();
    parts.willHappen = buckets['willHappen'].join('\n').trim();
    parts.done = buckets['done'].join('\n').trim();
    parts.restBefore = buckets['restBefore'].join('\n').trim();
    parts.restAfter = buckets['restAfter'].join('\n').trim();
    return parts;
  }

  fmt(n: number): string {
    return formatCurrency(n, this.store.settings().numeralMode || 'ar');
  }

  // سطر واحد يلخّص العملية المقترحة لبطاقة التأكيد (إيه اللي هيتغير بالظبط).
  actionSummaryLine(action: ZakiPendingWriteAction): string {
    const f = (n: number) => this.fmt(n);
    switch (action.type) {
      case 'record_pocket_withdrawal':
        return `سحب ${f(action.amount)} من فودافون كاش ${custodianLabel(action.custodian, action.custodianName)} إلى جيبه${action.withdrawalFee ? ` — مصاريف سحب ${f(action.withdrawalFee)}` : ''}`;
      case 'record_custodian_transfer':
        return `تحويل ${f(action.amount)} من ${custodianLabel(action.fromCustodian, action.fromCustodianName)} إلى ${custodianLabel(action.toCustodian, action.toCustodianName)} (فودافون كاش)${action.withdrawalFee ? ` — مصاريف سحب ${f(action.withdrawalFee)}` : ''}`;
      case 'record_advance': {
        const fundedBy = action.fundedBy || 'mahmoud_ayman';
        const from = action.paidFrom === 'vodafone' ? 'فودافون كاش' : 'الجيب';
        const newWorkerNote = action.newWorkerRole
          ? ` (عامل جديد — ${action.newWorkerRole}، هيتضاف لقائمة العمال)`
          : '';
        return `سلفة ${f(action.amount)} لـ ${action.workerName}${newWorkerNote} — من ${from} ${custodianLabel(fundedBy)}`;
      }
      case 'record_expense':
        return `مصروف ${f(action.amount)} (${action.category})${action.note ? ` — ${action.note}` : ''}`;
      case 'record_incoming_payment':
        return `دفعة واردة ${f(action.amount)} من ${action.sourceName}`;
      case 'record_check':
        return `شيك ${action.direction} ${f(action.amount)} — الحالة: ${action.status}`;
      case 'update_check_status':
        return `تغيير حالة الشيك ${action.checkNumber} إلى «${action.newStatus}»`;
      case 'update_worker_rate':
        return `تعديل يومية ${action.workerName} إلى ${f(action.workerDayRate)} (وسهرة ${f(action.workerNightRate)})`;
      case 'delete_record':
        return `حذف: ${action.description}`;
      case 'settle_worker':
        return `تسوية وصرف ${f(action.netPaid)} لـ ${action.workerName}`;
      case 'create_extract':
        return `إنشاء مستخلص رقم ${action.number} لمشروع ${action.projectName}`;
      default:
        return 'تنفيذ العملية المقترحة';
    }
  }

  // أرصدة قبل/بعد للعملية المقترحة (للحركات اللي بتأثر على أرصدة الأمناء).
  actionBalancePreview(action: ZakiPendingWriteAction): { label: string; before: number; after: number }[] | null {
    const balances = this.store.custodianBalances().balances;
    if (action.type === 'record_pocket_withdrawal') {
      const b = balances.find((x) => x.custodian === action.custodian);
      if (!b) return null;
      return [
        { label: `${b.name} — فودافون كاش`, before: b.vodafoneBalance, after: b.vodafoneBalance - action.amount - (action.withdrawalFee || 0) },
        { label: `${b.name} — الجيب`, before: b.pocketBalance, after: b.pocketBalance + action.amount },
      ];
    }
    if (action.type === 'record_custodian_transfer') {
      const from = balances.find((x) => x.custodian === action.fromCustodian);
      const to = balances.find((x) => x.custodian === action.toCustodian);
      if (!from || !to) return null;
      return [
        { label: `${from.name} — فودافون كاش`, before: from.vodafoneBalance, after: from.vodafoneBalance - action.amount - (action.withdrawalFee || 0) },
        { label: `${to.name} — فودافون كاش`, before: to.vodafoneBalance, after: to.vodafoneBalance + action.amount },
      ];
    }
    if (action.type === 'record_advance') {
      const fundedBy = action.fundedBy || 'mahmoud_ayman';
      const b = balances.find((x) => x.custodian === fundedBy);
      if (!b) return null;
      if (action.paidFrom === 'vodafone') {
        return [{ label: `${b.name} — فودافون كاش`, before: b.vodafoneBalance, after: b.vodafoneBalance - action.amount }];
      }
      return [{ label: `${b.name} — الجيب`, before: b.pocketBalance, after: b.pocketBalance - action.amount }];
    }
    return null;
  }

  async confirmAction(msg: ChatMessage): Promise<void> {
    const action: ZakiPendingWriteAction | undefined =
      msg.responseMeta?.pendingAction;
    if (!action) return;
    let executedRef: ChatMessage['executedRef'];

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
      const fundedBy = action.fundedBy || 'mahmoud_ayman';
      // New worker chosen from the role buttons: create the worker first
      // (reusing the existing record if one appeared meanwhile), then the
      // advance points at the real id.
      let targetWorkerId = action.workerId;
      if ((!targetWorkerId || targetWorkerId === 0) && action.newWorkerRole) {
        const existing = this.store
          .workers()
          .find((w) => w.name.trim() === action.workerName.trim());
        if (existing?.id) {
          targetWorkerId = existing.id;
        } else {
          const dayRate = this.store.settings().defaultWorkerDayRate || 400;
          const nightRate =
            this.store.settings().defaultWorkerNightRate ||
            Math.round(dayRate / 2);
          targetWorkerId = await this.store.saveWorker({
            name: action.workerName,
            role: action.newWorkerRole,
            workerDayRate: dayRate,
            workerNightRate: nightRate,
            phone: '',
            active: true,
            notes: 'أُضيف عبر المساعد زكي',
          });
        }
      }
      const id = await this.store.addAdvance({
        workerId: targetWorkerId,
        amount: action.amount,
        date: action.date,
        reason: action.reason,
        settlementId: null,
        fundedBy,
        paidFrom: action.paidFrom || 'pocket',
        withdrawnBy: custodianLabel(fundedBy),
        notes: 'مسجل عبر المساعد زكي',
      });
      executedRef = { kind: 'advance', id };
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
      const id = await this.store.saveIncomingPayment({
        date: action.date,
        sourceType: action.sourceType,
        sourceName: action.sourceName,
        amount: action.amount,
        method: action.method,
        projectId: action.projectId,
        checkNumber: action.checkNumber || '',
        notes: action.notes,
      });
      executedRef = { kind: 'incoming', id };
    } else if (action.type === 'record_expense') {
      const id = await this.store.saveExpense({
        date: action.date,
        category: action.category,
        amount: action.amount,
        projectId: action.projectId,
        note: action.note,
      });
      executedRef = { kind: 'expense', id };
    } else if (action.type === 'record_check') {
      const id = await this.store.saveCheck({
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
      executedRef = { kind: 'check', id };
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
    } else if (action.type === 'record_custodian_transfer') {
      const id = await this.store.addCustodianTransfer({
        date: action.date,
        kind: 'transfer',
        fromCustodian: action.fromCustodian,
        fromCustodianName: action.fromCustodianName,
        toCustodian: action.toCustodian,
        toCustodianName: action.toCustodianName,
        amount: action.amount,
        withdrawalFee: action.withdrawalFee || 0,
        method: action.method || 'فودافون كاش',
        notes: action.notes,
      });
      executedRef = { kind: 'transfer', id };
    } else if (action.type === 'record_pocket_withdrawal') {
      const id = await this.store.addCustodianTransfer({
        date: action.date,
        kind: 'pocket_withdrawal',
        fromCustodian: action.custodian,
        fromCustodianName: action.custodianName,
        toCustodian: action.custodian,
        toCustodianName: action.custodianName,
        amount: action.amount,
        withdrawalFee: action.withdrawalFee || 0,
        method: 'فودافون كاش',
        notes: action.notes,
      });
      executedRef = { kind: 'transfer', id };
    }

    // ملخص «اللي تم» بعد التنفيذ: جملة واحدة بالأرقام الجديدة (رصيد بعد
    // العملية) عشان المستخدم يشوف النتيجة من غير ما يدور عليها.
    let executedSummary: string | undefined;
    const balancesNow = this.store.custodianBalances().balances;
    const balOf = (c: string) => balancesNow.find((x) => x.custodian === c);
    if (action.type === 'record_pocket_withdrawal') {
      const b = balOf(action.custodian);
      executedSummary = b
        ? `سحبت ${this.fmt(action.amount)} من فودافون ${custodianLabel(action.custodian)} للجيب — فودافون بقى ${this.fmt(b.vodafoneBalance)}، والجيب بقى ${this.fmt(b.pocketBalance)}.`
        : `سحبت ${this.fmt(action.amount)} من فودافون للجيب.`;
    } else if (action.type === 'record_custodian_transfer') {
      const from = balOf(action.fromCustodian);
      const to = balOf(action.toCustodian);
      executedSummary = from && to
        ? `حوّلت ${this.fmt(action.amount)} من ${custodianLabel(action.fromCustodian)} إلى ${custodianLabel(action.toCustodian)} — فودافون ${custodianLabel(action.fromCustodian)} بقى ${this.fmt(from.vodafoneBalance)}، وفودافون ${custodianLabel(action.toCustodian)} بقى ${this.fmt(to.vodafoneBalance)}.`
        : `حوّلت ${this.fmt(action.amount)} من ${custodianLabel(action.fromCustodian)} إلى ${custodianLabel(action.toCustodian)}.`;
    } else if (action.type === 'record_advance') {
      const b = balOf(action.fundedBy || 'mahmoud_ayman');
      const after = b
        ? action.paidFrom === 'vodafone'
          ? `فودافون بقى ${this.fmt(b.vodafoneBalance)}`
          : `الجيب بقى ${this.fmt(b.pocketBalance)}`
        : '';
      executedSummary = `سجّلت سلفة ${this.fmt(action.amount)} لـ ${action.workerName}${after ? ` — ${after}.` : '.'}`;
    } else if (action.type === 'record_expense') {
      executedSummary = `سجّلت مصروف ${this.fmt(action.amount)} (${action.category}).`;
    } else if (action.type === 'record_incoming_payment') {
      executedSummary = `سجّلت دفعة واردة ${this.fmt(action.amount)} من ${action.sourceName}.`;
    } else if (action.type === 'record_check') {
      executedSummary = `سجّلت شيك ${action.direction} ${this.fmt(action.amount)} — الحالة: ${action.status}.`;
    } else if (action.type === 'delete_record') {
      executedSummary = `حذفت: ${action.description}.`;
    } else if (action.type === 'update_worker_rate') {
      executedSummary = `عدّلت يومية ${action.workerName} إلى ${this.fmt(action.workerDayRate)} (وسهرة ${this.fmt(action.workerNightRate)}).`;
    } else if (action.type === 'update_check_status') {
      executedSummary = `غيّرت حالة الشيك ${action.checkNumber} إلى «${action.newStatus}».`;
    }

    this.messages.update((list) =>
      list.map((m) =>
        m.id === msg.id
          ? { ...m, actionResolved: 'confirmed', executedRef, executedSummary }
          : m
      )
    );
    this.store.showToast('تم تنفيذ أمر زكي وحفظه ومزامنته بنجاح', 'success');
  }

  async undoExecuted(msg: ChatMessage): Promise<void> {
    const ref = msg.executedRef;
    if (!ref || msg.actionUndone) return;
    if (ref.kind === 'transfer') {
      await this.store.deleteCustodianTransfer(ref.id);
    } else if (ref.kind === 'advance') {
      await this.store.deleteAdvance(ref.id);
    } else if (ref.kind === 'expense') {
      await this.store.deleteExpense(ref.id);
    } else if (ref.kind === 'incoming') {
      await this.store.deleteIncomingPayment(ref.id);
    } else if (ref.kind === 'check') {
      await this.store.deleteCheck(ref.id);
    }
    this.messages.update((list) =>
      list.map((m) => (m.id === msg.id ? { ...m, actionUndone: true } : m))
    );
    this.store.showToast('تم التراجع عن العملية ورجعت الأرصدة زي ما كانت', 'success');
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
