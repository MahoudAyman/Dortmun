import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { ExcelService } from '../../shared/excel-export';
import {
  processZakiMessage,
  type ZakiPendingWriteAction,
  type ZakiResponse,
} from '../../core/chat/zaki-engine';
import type { ExtraCash } from '../../core/db/models';

interface ChatMessage {
  id: number;
  sender: 'user' | 'zaki';
  text: string;
  timestamp: string;
  responseMeta?: ZakiResponse;
  actionResolved?: 'confirmed' | 'cancelled';
}

@Component({
  selector: 'app-zaki',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, MatIconModule],
  template: `
    <div class="max-w-4xl mx-auto space-y-4">
      <!-- Zaki Ceramic Hero Banner -->
      <div class="ceramic-hero text-white p-5 lg:p-6 flex flex-wrap items-center justify-between gap-4">
        <div class="flex items-center gap-3.5">
          <div class="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center font-extrabold text-xl shadow-sm">
            ز
          </div>
          <div>
            <h2 class="text-lg font-extrabold flex items-center gap-2">
              <span>المساعد الذكي الخارق "زكي"</span>
              <span class="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
                يعمل ١٠٠٪ محلياً بدون إنترنت
              </span>
            </h2>
            <p class="text-xs text-slate-300 mt-1">
              يفهم العدد اليومي الإجباري، النحّاتية، الخصومات والجزاءات، قبض يوم ١٥، إضافة عمال ومشاريع، اليوميات، السلف، الناش، والمستخلصات.
            </p>
          </div>
        </div>
      </div>

      <!-- Quick Suggested Commands Bar -->
      <div class="ceramic-card p-4 space-y-2.5">
        <div class="text-xs font-extrabold text-slate-600 dark:text-slate-300 flex items-center gap-1.5">
          <mat-icon class="!text-base !w-4 !h-4 text-amber-500">bolt</mat-icon>
          <span>أوامر ذكية سريعة بالعامية المصرية (اضغط للتجربة الفورية):</span>
        </div>
        <div class="flex flex-wrap gap-2">
          @for (cmd of sampleCommands; track cmd) {
            <button
              type="button"
              (click)="sendCommand(cmd)"
              class="px-3 py-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold transition-colors"
            >
              {{ cmd }}
            </button>
          }
        </div>
      </div>

      <!-- Chat Messages Container -->
      <div class="ceramic-card p-4 lg:p-5 space-y-4 min-h-[380px] max-h-[540px] overflow-y-auto">
        @for (msg of messages(); track msg.id) {
          <div
            class="flex"
            [class.justify-start]="msg.sender === 'user'"
            [class.justify-end]="msg.sender === 'zaki'"
          >
            <div
              class="max-w-xl rounded-3xl p-4 space-y-3 text-sm leading-relaxed shadow-xs"
              [class.bg-slate-900]="msg.sender === 'user'"
              [class.text-white]="msg.sender === 'user'"
              [class.bg-slate-100]="msg.sender === 'zaki'"
              [class.dark:bg-slate-800]="msg.sender === 'zaki'"
              [class.text-slate-900]="msg.sender === 'zaki'"
              [class.dark:text-slate-100]="msg.sender === 'zaki'"
            >
              <div class="flex items-center justify-between gap-4 text-[11px] opacity-70">
                <span class="font-extrabold">{{ msg.sender === 'user' ? 'أنت' : 'زكي (المساعد الذكي)' }}</span>
                <span class="tabular-nums">{{ msg.timestamp }}</span>
              </div>

              <p class="font-semibold whitespace-pre-line">{{ msg.text }}</p>

              <!-- Confirmation Buttons ("تمام" / "إلغاء") before writing to DB -->
              @if (msg.responseMeta?.requiresConfirmation && msg.responseMeta?.pendingAction && !msg.actionResolved) {
                <div class="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-center gap-2">
                  <button
                    type="button"
                    (click)="confirmAction(msg)"
                    class="min-h-[40px] px-5 py-2 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs"
                  >
                    <mat-icon class="!text-base !w-4 !h-4">check</mat-icon>
                    <span>تمام (تأكيد الحفظ)</span>
                  </button>
                  <button
                    type="button"
                    (click)="cancelAction(msg)"
                    class="min-h-[40px] px-4 py-2 rounded-2xl bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 font-extrabold text-xs inline-flex items-center gap-1.5"
                  >
                    <mat-icon class="!text-base !w-4 !h-4">close</mat-icon>
                    <span>إلغاء</span>
                  </button>
                </div>
              }

              @if (msg.actionResolved === 'confirmed') {
                <div class="text-xs font-extrabold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                  <mat-icon class="!text-sm !w-4 !h-4">verified</mat-icon>
                  <span>تم التأكيد والتسجيل في قاعدة البيانات بنجاح.</span>
                </div>
              }

              @if (msg.actionResolved === 'cancelled') {
                <div class="text-xs font-extrabold text-rose-600 flex items-center gap-1">
                  <mat-icon class="!text-sm !w-4 !h-4">cancel</mat-icon>
                  <span>تم إلغاء العملية ولم يتم تغيير أي بيانات.</span>
                </div>
              }

              <!-- Direct Navigation Action Button ("زر التحويل المباشر") -->
              @if (msg.responseMeta?.actionRoute && msg.responseMeta?.actionLabel) {
                <div class="flex flex-wrap gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/70">
                  <a
                    [routerLink]="msg.responseMeta!.actionRoute!"
                    class="px-3.5 py-2 rounded-2xl bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5 shadow-xs hover:opacity-90 transition-opacity"
                  >
                    <mat-icon class="!text-sm !w-4 !h-4">open_in_new</mat-icon>
                    <span>{{ msg.responseMeta!.actionLabel }}</span>
                    <mat-icon class="!text-sm !w-4 !h-4">arrow_back</mat-icon>
                  </a>
                </div>
              }

              <!-- Disambiguation Options -->
              @if (msg.responseMeta?.disambiguationOptions?.length) {
                <div class="flex flex-wrap gap-2 pt-2">
                  @for (opt of msg.responseMeta!.disambiguationOptions!; track opt.label) {
                    <button
                      type="button"
                      (click)="sendCommand(opt.command)"
                      class="px-3 py-1.5 rounded-2xl bg-amber-500 text-slate-950 font-extrabold text-xs"
                    >
                      {{ opt.label }}
                    </button>
                  }
                </div>
              }

              <!-- Quick Fallback Commands -->
              @if (msg.responseMeta?.quickCommands?.length) {
                <div class="flex flex-wrap gap-2 pt-2">
                  @for (q of msg.responseMeta!.quickCommands!; track q) {
                    <button
                      type="button"
                      (click)="sendCommand(q)"
                      class="px-3 py-1.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold hover:border-amber-500 transition-colors"
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

      <!-- Input Box -->
      <form
        (submit)="$event.preventDefault(); sendUserInput()"
        class="ceramic-card p-3 flex items-center gap-3"
      >
        <label for="zaki-input" class="sr-only">اكتب أمر لزكي</label>
        <input
          id="zaki-input"
          type="text"
          [value]="inputText()"
          (input)="inputText.set($any($event.target).value)"
          placeholder="اكتب أمرك بالعامية.. مثلاً: سجل العدد اليومي 10 عمال و 4 نحاتين و 5 سهرة النهارده"
          class="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl px-4 py-3 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-amber-500"
        />
        <button
          type="submit"
          class="min-h-[48px] px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-sm inline-flex items-center gap-2 shadow-xs"
        >
          <mat-icon>send</mat-icon>
          <span>إرسال</span>
        </button>
      </form>
    </div>
  `,
})
export class ZakiPage {
  readonly store = inject(StoreService);
  readonly excel = inject(ExcelService);
  private readonly router = inject(Router);

  readonly inputText = signal<string>('');
  readonly awaitingAdvanceWorkerId = signal<number | null>(null);
  private nextMsgId = 2;

  readonly sampleCommands = [
    'سجل العدد اليومي 10 عمال و 4 نحاتين و 5 سهرة النهارده',
    'هل العدد اليومي مطابق النهارده؟',
    'احسب قبض يوم 15 لكل العمال',
    'ضيف نحات جديد اسمه ابراهيم بيومية 500 وسهرة 250',
    'ضيف مشروع جديد اسمه كمبوند النخيل بيومية 650 وسهرة 325',
    'اخصم نص يوم من ابراهيم بسبب تأخير',
    'زكي سجل يومية لكل النحاتين النهارده',
    'إجمالي الخصومات الشهر ده كام؟',
    'احسب إجمالي الناش لجميع الموظفين في هذا الشهر',
    'مين وصل الحد؟ ومين ناقص؟',
    'افتح الإضافة الجماعية',
  ];

  readonly messages = signal<ChatMessage[]>([
    {
      id: 1,
      sender: 'zaki',
      text: 'أهلاً بيك يا هندسة في شركة دورتمون! أنا زكي مساعدك الذكي المطور. دلوقتي أقدر أسجلك العدد اليومي الإجباري (عمالة + نحاتية + سهرة) وأقارنهولك بالمسجل، وأسجل الخصومات والجزاءات (يوم أو نص يوم أو فلوس مع السبب)، وأحسبلك كشف قبض يوم 15 في الشهر، وكمان أضيفلك عمال ونحاتين ومشاريع فوراً!',
      timestamp: 'الآن',
      responseMeta: {
        reply: '',
        requiresConfirmation: false,
        actionRoute: '/attendance',
        actionLabel: 'تحويل لتسجيل العدد اليومي الإجباري',
      },
    },
  ]);

  sendUserInput(): void {
    const txt = this.inputText().trim();
    if (!txt) return;
    this.inputText.set('');
    this.sendCommand(txt);
  }

  sendCommand(commandText: string): void {
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
      extracts: this.store.extracts(),
      extractLines: this.store.extractLines(),
      extras: this.store.extras(),
      extraCashes: this.store.extraCashes(),
      checks: this.store.checks(),
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
    } else if (action.type === 'add_project') {
      await this.store.saveProject({
        name: action.name,
        companyDayRate: action.companyDayRate,
        companyNightRate: action.companyNightRate,
        active: true,
        notes: 'تمت الإضافة عبر المساعد زكي',
      });
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
    this.store.showToast('تم تنفيذ أمر زكي وحفظه بنجاح', 'success');
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
