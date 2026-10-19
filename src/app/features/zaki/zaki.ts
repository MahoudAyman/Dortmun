import {
  ChangeDetectionStrategy,
  Component,
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
}

@Component({
  selector: 'app-zaki-page',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="max-w-5xl mx-auto flex flex-col gap-3 sm:gap-4 pb-8 animate-fade-in">
      <!-- Header with Prominent "ماذا يمكن للبوت فعله؟" Button -->
      <div
        class="bg-gradient-to-l from-slate-900 via-slate-800 to-slate-900 text-white rounded-2xl p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md border border-amber-500/30"
      >
        <div class="flex items-center gap-3">
          <div
            class="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-md shrink-0"
          >
            <mat-icon class="!w-6 !h-6 !text-[24px]">smart_toy</mat-icon>
          </div>
          <div>
            <div class="flex flex-wrap items-center gap-2">
              <h2 class="text-base sm:text-lg font-extrabold">
                المساعد الذكي «زكي» بالعامية المصرية
              </h2>
              <span
                class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold"
              >
                يعمل كل حاجة في الموقع ١٠٠٪
              </span>
            </div>
            <p class="text-[11px] sm:text-xs text-slate-300 mt-0.5">
              يضيف ويحذف ويعدل، يسجل مقبوضات وسلف وخصومات ومستخلصات وشيكات، ويحسب ربح كل مشروع بالصوت أو الكتابة
            </p>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-2 relative">
          <!-- Button that opens the "ما يمكن للبوت فعله" Capabilities Page/Modal -->
          <button
            type="button"
            (click)="showCapabilitiesPage.set(!showCapabilitiesPage())"
            class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl font-extrabold text-xs transition-all cursor-pointer shadow-sm"
            [class]="
              showCapabilitiesPage()
                ? 'bg-emerald-500 text-slate-950'
                : 'bg-amber-500 hover:bg-amber-400 text-slate-950'
            "
          >
            <mat-icon class="!w-4 !h-4 !text-[18px]">menu_book</mat-icon>
            <span>{{ showCapabilitiesPage() ? 'العودة لشات زكي' : 'ماذا يمكن للبوت فعله؟ (دليل قدرات زكي)' }}</span>
          </button>

          <a
            routerLink="/my-ledger"
            class="hidden sm:inline-flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs border border-white/15 transition-colors"
          >
            <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-400">account_balance_wallet</mat-icon>
            <span>حسابي الشامل</span>
          </a>

          <!-- Three-Dots (⋮) Zaki Options Menu -->
          <button
            type="button"
            (click)="zakiHeaderMoreOpen.set(!zakiHeaderMoreOpen())"
            class="inline-flex items-center justify-center gap-1 px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-amber-300 font-extrabold text-xs border border-amber-400/30 transition-colors cursor-pointer"
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
              class="absolute left-0 top-full mt-2 w-64 rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-2 z-50 space-y-1 text-white"
              (click)="$event.stopPropagation()"
            >
              <div class="px-2.5 py-1 text-[10px] font-extrabold text-amber-400 border-b border-slate-800">
                أدوات واختصارات المساعد زكي
              </div>
              <button
                type="button"
                (click)="runCommand('قارن ربحية المشاريع'); zakiHeaderMoreOpen.set(false)"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold text-right cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-400">leaderboard</mat-icon>
                <span>تحليل ومقارنة ربحية المشاريع</span>
              </button>
              <button
                type="button"
                (click)="runCommand('منهجية الحسابات ونصايح المقاولات'); zakiHeaderMoreOpen.set(false)"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold text-right cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-400">auto_stories</mat-icon>
                <span>الدليل المنهجي للمقاولات (6 قواعد)</span>
              </button>
              <button
                type="button"
                (click)="copyChatHistory(); zakiHeaderMoreOpen.set(false)"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold text-right cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] text-blue-400">content_copy</mat-icon>
                <span>نسخ سجل المحادثة للواتساب</span>
              </button>
              <a
                routerLink="/my-ledger"
                (click)="zakiHeaderMoreOpen.set(false)"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-slate-800 text-xs font-bold text-right"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-400">account_balance_wallet</mat-icon>
                <span>فتح صفحة حسابي الشامل والخزنة</span>
              </a>
              <button
                type="button"
                (click)="clearChat(); zakiHeaderMoreOpen.set(false)"
                class="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-rose-950/50 text-rose-300 text-xs font-bold text-right cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[16px] text-rose-400">refresh</mat-icon>
                <span>مسح المحادثة وبدء صفحة جديدة</span>
              </button>
            </div>
          }
        </div>
      </div>

      <!-- INTERACTIVE CAPABILITIES PAGE ("صفحة بزر عندما تظهر تعرفني ما يمكن للبوت فعله") -->
      @if (showCapabilitiesPage()) {
        <div
          class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-amber-500/40 shadow-md p-4 sm:p-6 space-y-5 animate-fade-in"
        >
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div>
              <div class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-extrabold mb-1">
                <mat-icon class="!w-4 !h-4 !text-[16px]">auto_awesome</mat-icon>
                <span>دليل قدرات المساعد الذكي «زكي» بالعامية المصرية</span>
              </div>
              <h3 class="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
                كل حاجة يقدر «زكي» يعملها في الموقع بلا استثناء
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                اضغط على أي جملة من الجمل تحت وهتتنفذ فوراً في الشات، أو قولها بصوتك بالعامية المصرية!
              </p>
            </div>

            <button
              type="button"
              (click)="showCapabilitiesPage.set(false)"
              class="self-start sm:self-center inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 dark:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[16px]">chat</mat-icon>
              <span>افتح المحادثة الآن</span>
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            @for (sec of capabilitiesGuide; track sec.id) {
              <div
                class="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 p-4 flex flex-col justify-between gap-3"
              >
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1.5">
                    <div class="flex items-center gap-2">
                      <div class="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <mat-icon class="!w-5 !h-5 !text-[20px]">{{ sec.icon }}</mat-icon>
                      </div>
                      <h4 class="text-sm font-extrabold text-slate-900 dark:text-white">
                        {{ sec.title }}
                      </h4>
                    </div>
                    <span class="px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-200 text-[10px] font-extrabold shrink-0">
                      {{ sec.badge }}
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 mb-3">
                    {{ sec.subtitle }}
                  </p>

                  <div class="space-y-2">
                    @for (ex of sec.examples; track ex.phrase) {
                      <div
                        class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-700/80 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:border-amber-500 transition-colors"
                      >
                        <div class="space-y-0.5 min-w-0">
                          <div class="text-xs font-extrabold text-slate-900 dark:text-amber-300">
                            «{{ ex.phrase }}»
                          </div>
                          <div class="text-[11px] text-slate-500 dark:text-slate-400">
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
        class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-3 shadow-sm"
      >
        <div class="flex items-center justify-between mb-2">
          <div class="text-[11px] font-extrabold text-slate-500 dark:text-slate-400 flex items-center gap-1">
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
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-slate-700 dark:text-slate-300 text-[11px] font-bold transition-colors cursor-pointer"
            >
              {{ cmd }}
            </button>
          }
        </div>
      </div>

      <!-- Chat Messages Stream -->
      <div
        class="min-h-[360px] max-h-[62vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 sm:p-4 overflow-y-auto space-y-4 flex flex-col"
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
            <div class="flex items-center gap-1.5 mb-1 px-1">
              <span class="text-[10px] font-extrabold text-slate-400">
                {{ msg.sender === 'user' ? 'أنت (يا هندسة)' : 'المساعد زكي 🤖' }} · {{ msg.timestamp }}
              </span>
            </div>

            <div
              class="rounded-2xl px-3.5 py-2.5 sm:px-4 sm:py-3 text-xs sm:text-sm font-bold leading-relaxed shadow-xs whitespace-pre-line"
              [class]="
                msg.sender === 'user'
                  ? 'bg-slate-900 dark:bg-slate-800 text-white rounded-tr-xs'
                  : 'bg-amber-50 dark:bg-slate-800/90 text-slate-900 dark:text-slate-100 border border-amber-200 dark:border-slate-700 rounded-tl-xs'
              "
            >
              {{ msg.text }}

              <!-- Direct Navigation Button ("زر التحويل المباشر") -->
              @if (msg.responseMeta?.actionRoute && msg.responseMeta?.actionLabel) {
                <div class="mt-2.5 pt-2 border-t border-amber-200/60 dark:border-slate-700 flex flex-wrap items-center gap-2">
                  <a
                    [routerLink]="msg.responseMeta!.actionRoute!"
                    class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 text-xs font-extrabold hover:opacity-90 transition-opacity shadow-xs"
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
                  class="mt-3 pt-3 border-t border-amber-200 dark:border-slate-700 flex flex-wrap items-center gap-2"
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
                    class="px-3 py-2 rounded-xl bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 text-xs font-bold flex items-center gap-1 cursor-pointer"
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
                      class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-amber-400 text-slate-900 dark:text-white text-xs font-extrabold hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
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
                      class="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold hover:border-amber-500 cursor-pointer"
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
        class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-2.5 sm:p-3 shadow-sm flex items-center gap-2 sticky bottom-2 z-20"
      >
        <button
          type="button"
          (click)="toggleVoiceRecognition()"
          class="w-11 h-11 rounded-xl flex items-center justify-center transition-all cursor-pointer shrink-0"
          [class]="
            isListening()
              ? 'bg-rose-600 text-white animate-pulse'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-amber-500 hover:text-slate-950'
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
          class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm font-bold focus:outline-none focus:border-amber-500"
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
        'دلوقتي أقدر أعملك أي حاجة وكل حاجة في الموقع بلا استثناء:\n' +
        '• أسجل الفلوس اللي وصلتك (شيكات أو من شركة أو من شخص) وأقولك راحت لحساب مشروع إيه، واتصرف كام سلف وقبض، وليك كام وعليك كام وصافي ربحك.\n' +
        '• أقارن ربحية كل المشاريع، أعرضلك كشف حساب مفصل لأي عامل، وأقدم الدليل المنهجي للمقاولات.\n' +
        '• أسجل العدد اليومي الإجباري، أحضر العمال والنحاتية، أصرف سلف، أوقع خصومات، أعمل مستخلصات، وأصرف شيكات.\n' +
        '• أضيف وأعدل وأحذف أي عامل أو مشروع أو حركة بكلمة واحدة!\n' +
        'اضغط على زر «ماذا يمكن للبوت فعله؟» فوق عشان تشوف كل قدراتي وتجربها بضغطة زر.',
      timestamp: 'الآن',
      responseMeta: {
        reply: '',
        actionRoute: '/my-ledger',
        actionLabel: 'فتح صفحة حسابي الشامل والخزنة',
      },
    },
  ]);

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
      },
    ]);
  }

  tryCapabilityCommand(phrase: string): void {
    this.showCapabilitiesPage.set(false);
    this.runCommand(phrase);
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
    this.runCommand(text);
  }

  runCommand(commandText: string): void {
    const userMsg: ChatMessage = {
      id: this.nextMsgId++,
      sender: 'user',
      text: commandText,
      timestamp: 'الآن',
    };

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

    const zakiMsg: ChatMessage = {
      id: this.nextMsgId++,
      sender: 'zaki',
      text: response.reply,
      timestamp: 'الآن',
      responseMeta: response,
    };

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
