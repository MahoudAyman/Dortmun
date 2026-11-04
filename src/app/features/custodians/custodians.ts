import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import { CUSTODIANS, custodianLabel } from '../../core/db/models';
import type {
  CustodianBalance,
  CustodianId,
  CustodianTransfer,
} from '../../core/db/models';

export interface CustodianMovement {
  date: string;
  kind: 'in' | 'out';
  label: string;
  fromTo: string;
  amount: number;
  notes: string;
  transferId?: number;
}

export interface CustodianAccount {
  id: CustodianId;
  name: string;
  otherNames: string[];
  balance: CustodianBalance;
  transfersIn: number;
  transfersOut: number;
  pocketWithdrawals: number;
  pocketWithdrawalsFees: number;
  settlementsPaid: number;
  nashPaid: number;
  externalExpenses: number;
  receivedFrom: { name: string; amount: number }[];
  advances: {
    workerName: string;
    amount: number;
    date: string;
    withdrawnBy: string;
    fee: number;
    paidFrom: string;
    reason: string;
  }[];
  movements: CustodianMovement[];
}

const BUCKETS: CustodianId[] = ['mahmoud_ayman', 'mahmoud_hamada', 'ayman_hassan', 'other'];

function bucketOf(id: CustodianId | string | undefined): CustodianId | null {
  if (!id) return null;
  if (id === 'mahmoud_ayman' || id === 'mahmoud_hamada' || id === 'ayman_hassan') return id;
  return 'other';
}

@Component({
  selector: 'app-custodians',
  imports: [ReactiveFormsModule, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5 pb-10 animate-fade-in">
      <!-- Header -->
      <div class="relative overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-6 shadow-md border border-emerald-500/20">
        <div class="relative z-10 space-y-1.5">
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold">
            <mat-icon class="!w-4 !h-4 !text-[16px]">account_balance_wallet</mat-icon>
            <span>حسابات أمناء العهدة · فودافون كاش والجيب</span>
          </div>
          <h2 class="text-xl sm:text-2xl font-extrabold tracking-tight">حسابات الأمناء — مين معاه كام؟</h2>
          <p class="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
            كل أمين ليه حسابين: <strong class="text-emerald-300">فودافون كاش</strong> (الفلوس اللي لسه على المحفظة)
            و<strong class="text-amber-300">الجيب</strong> (الكاش اللي اتسحب من المحفظة).
            السلف والمصاريف والتسويات بتتدفع من الجيب افتراضياً — يعني لازم يتسجل سحب جيب الأول، وبعدين السلف بتتخصم من الجيب مش من فودافون كاش.
          </p>
        </div>
      </div>

      <!-- طريقة الحساب -->
      <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs">
        <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-600 shrink-0 mt-0.5">info</mat-icon>
        <div class="leading-relaxed text-slate-700 dark:text-slate-300">
          <strong class="text-amber-900 dark:text-amber-300">ازاي بيتحسب؟</strong>
          فودافون كاش = الواصل − التحويلات الصادرة − سحوبات الجيب − المصروفات من فودافون − كل مصاريف السحب.
          الجيب = سحوبات الجيب − المصروفات من الجيب (السلف والتسويات والمصاريف).
          مثال: محمود حماده صرف شيك 71000 وحوّله لمحمود أيمن → فودافون أيمن 71000، سحب 4000 للجيب → فودافون 67000 والجيب 4000،
          سلف 10 × 150 = 1500 من الجيب → الجيب 2500 والإجمالي معاه 69500.
          لو الجيب طلع بالسالب بالأحمر، معناه إن في سلف اتسجلت على الأمين من غير ما يتسجل سحب جيب قبلها — سجّل سحب الجيب من النموذج اللي تحت.
        </div>
      </div>

      <!-- نموذج تسجيل حركة بين أمناء أو سحب للجيب -->
      <form
        [formGroup]="moveForm"
        (ngSubmit)="saveMovement()"
        class="bg-white dark:bg-slate-900 p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4"
      >
        <h3 class="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
          <mat-icon class="text-emerald-600">swap_horiz</mat-icon>
          <span>تسجيل تحويل بين أمناء أو سحب من فودافون كاش للجيب</span>
        </h3>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 items-end">
          <div>
            <label for="mv-kind" class="block text-xs font-bold mb-1">نوع الحركة *</label>
            <select id="mv-kind" formControlName="kind" (change)="onKindChange()" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              <option value="transfer">تحويل بين أمناء</option>
              <option value="pocket">سحب من فودافون كاش للجيب</option>
            </select>
          </div>

          <div>
            <label for="mv-date" class="block text-xs font-bold mb-1">التاريخ *</label>
            <input id="mv-date" type="date" formControlName="date" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold" />
          </div>

          <div>
            <label for="mv-amount" class="block text-xs font-bold mb-1">المبلغ (ج.م) *</label>
            <input id="mv-amount" type="number" min="1" formControlName="amount" placeholder="مثلاً: 71000" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black tabular-nums" />
          </div>

          <div>
            <label for="mv-fee" class="block text-xs font-bold mb-1">مصاريف السحب (ج.م)</label>
            <input id="mv-fee" type="number" min="0" formControlName="withdrawalFee" placeholder="0" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-black tabular-nums" />
          </div>

          <div>
            <label for="mv-from" class="block text-xs font-bold mb-1">من أمين (المُرسل / صاحب المحفظة) *</label>
            <select id="mv-from" formControlName="fromCustodian" (change)="onFromChange()" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              @for (c of custodians; track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>

          @if (moveForm.get('fromCustodian')?.value === 'other') {
            <div>
              <label for="mv-from-name" class="block text-xs font-bold mb-1">اسم الأمين (أخرى) — من *</label>
              <input id="mv-from-name" type="text" formControlName="fromName" placeholder="اكتب الاسم" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold" />
            </div>
          }

          <div>
            <label for="mv-to" class="block text-xs font-bold mb-1">
              @if (moveForm.get('kind')?.value === 'pocket') {
                <span>إلى (الجيب — نفس الأمين تلقائياً)</span>
              } @else {
                <span>إلى أمين (المستلم) *</span>
              }
            </label>
            <select id="mv-to" formControlName="toCustodian" [disabled]="moveForm.get('kind')?.value === 'pocket'" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold disabled:opacity-60">
              @for (c of custodians; track c.id) {
                <option [value]="c.id">{{ c.name }}</option>
              }
            </select>
          </div>

          @if (moveForm.get('toCustodian')?.value === 'other' && moveForm.get('kind')?.value !== 'pocket') {
            <div>
              <label for="mv-to-name" class="block text-xs font-bold mb-1">اسم الأمين (أخرى) — إلى *</label>
              <input id="mv-to-name" type="text" formControlName="toName" placeholder="اكتب الاسم" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold" />
            </div>
          }

          <div>
            <label for="mv-method" class="block text-xs font-bold mb-1">طريقة التحويل</label>
            <select id="mv-method" formControlName="method" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold">
              <option value="فودافون كاش">فودافون كاش</option>
              <option value="إنستا باي">إنستا باي</option>
              <option value="تحويل بنكي">تحويل بنكي</option>
              <option value="نقدي">نقدي</option>
            </select>
          </div>

          <div class="sm:col-span-2">
            <label for="mv-notes" class="block text-xs font-bold mb-1">ملاحظات</label>
            <input id="mv-notes" type="text" formControlName="notes" placeholder="مثلاً: شيك الشركة 71000 — حولهولي محمود حماده" class="w-full px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-bold" />
          </div>
        </div>

        @if (formError()) {
          <div class="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-500/30 text-rose-700 dark:text-rose-300 text-xs font-bold">
            {{ formError() }}
          </div>
        }

        <div class="flex flex-wrap items-center gap-2">
          <button
            type="submit"
            [disabled]="saving()"
            class="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-extrabold text-sm cursor-pointer"
          >
            <mat-icon class="!w-5 !h-5 !text-[20px]">save</mat-icon>
            <span>{{ saving() ? 'جاري الحفظ…' : 'حفظ الحركة وتحديث كل الحسابات' }}</span>
          </button>
          <span class="text-[11px] text-slate-500">
            الحركة بتتسجل كتحويل أمين عهدة وبتظهر فوراً في حسابات الأمناء وفي حسابي الشامل، وبتتزامن مع Supabase مع باقي البيانات.
          </span>
        </div>
      </form>

      <!-- سجلات قديمة بدون أمين -->
      @let un = store.custodianBalances();
      @if (un.unassignedReceived > 0 || un.unassignedPaid > 0) {
        <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-dashed border-slate-300 dark:border-slate-700 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 text-sm font-extrabold text-slate-700 dark:text-slate-200">
            <mat-icon class="!w-5 !h-5 !text-[20px] text-slate-400">help_outline</mat-icon>
            <span>غير محدد — سجلات قديمة مفيهاش أمين عهدة (مش محسوبة على حد):</span>
          </div>
          <div class="flex flex-wrap gap-4 text-xs font-bold">
            <span class="text-emerald-600">وصل: {{ store.money(un.unassignedReceived) }}</span>
            <span class="text-rose-600">اتصرف: {{ store.money(un.unassignedPaid) }}</span>
          </div>
        </div>
      }

      <!-- كروت الأمناء -->
      <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
        @for (acc of accounts(); track acc.id) {
          <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <!-- رأس الكارت -->
            <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div class="flex items-center gap-2.5">
                <div class="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <mat-icon>account_balance_wallet</mat-icon>
                </div>
                <div>
                  <h3 class="text-base font-extrabold text-slate-900 dark:text-white">{{ acc.name }}</h3>
                  @if (acc.otherNames.length > 0) {
                    <p class="text-[11px] font-bold text-slate-500">الأسماء المسجلة تحت «أخرى»: {{ acc.otherNames.join('، ') }}</p>
                  } @else {
                    <p class="text-[11px] font-bold text-slate-500">أمين عهدة — فودافون كاش + جيب</p>
                  }
                </div>
              </div>
              <div class="text-left">
                <div class="text-[10px] font-bold text-slate-500">الإجمالي معاه (فودافون + جيب)</div>
                <div class="text-lg font-black tabular-nums" [class.text-emerald-600]="acc.balance.balance >= 0" [class.text-rose-600]="acc.balance.balance < 0">
                  {{ store.money(acc.balance.balance) }}
                </div>
              </div>
            </div>

            <div class="p-4 space-y-4">
              <!-- فودافون كاش / جيب -->
              <div class="grid grid-cols-2 gap-2.5">
                <div class="p-3 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/25">
                  <div class="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">على فودافون كاش</div>
                  <div class="text-lg font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">{{ store.money(acc.balance.vodafoneBalance) }}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">وصل {{ store.money(acc.balance.received) }} − تحويلات صادرة {{ store.money(acc.transfersOut) }} − سحب جيب {{ store.money(acc.pocketWithdrawals) }} − رسوم سحب {{ store.money(acc.balance.withdrawalFees) }}</div>
                </div>
                <div class="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-500/25">
                  <div class="text-[11px] font-bold text-amber-700 dark:text-amber-300">في الجيب (كاش)</div>
                  <div class="text-lg font-black tabular-nums mt-0.5" [class.text-amber-600]="acc.balance.pocketBalance >= 0" [class.text-rose-600]="acc.balance.pocketBalance < 0">{{ store.money(acc.balance.pocketBalance) }}</div>
                  <div class="text-[10px] text-slate-500 mt-0.5">سحب جيب {{ store.money(acc.pocketWithdrawals) }} − سلف ومصاريف من الجيب {{ store.money(acc.pocketWithdrawals - acc.balance.pocketBalance) }}</div>
                </div>
              </div>

              <!-- تفصيلة الواصل والمنصرف -->
              <div class="grid grid-cols-2 gap-2.5 text-xs">
                <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5">
                  <div class="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    <mat-icon class="!w-4 !h-4 !text-[16px]">south_west</mat-icon>
                    <span>اللي وصله ({{ store.money(acc.balance.received) }}):</span>
                  </div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>تحويلات واردة من أمناء:</span><span class="font-bold tabular-nums">{{ store.money(acc.transfersIn) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>دفعات ومستخلصات وشيكات:</span><span class="font-bold tabular-nums">{{ store.money(acc.balance.received - acc.transfersIn) }}</span></div>
                </div>
                <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5">
                  <div class="font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                    <mat-icon class="!w-4 !h-4 !text-[16px]">north_east</mat-icon>
                    <span>اللي صرفه:</span>
                  </div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>سلف للناس:</span><span class="font-bold tabular-nums">{{ store.money(acc.balance.advancesPaid) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>تسويات وقبض:</span><span class="font-bold tabular-nums">{{ store.money(acc.settlementsPaid) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>ناش ومصاريف خارجية:</span><span class="font-bold tabular-nums">{{ store.money(acc.nashPaid + acc.externalExpenses) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>تحويلات صادرة لأمناء:</span><span class="font-bold tabular-nums">{{ store.money(acc.transfersOut) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>سحوبات للجيب:</span><span class="font-bold tabular-nums">{{ store.money(acc.pocketWithdrawals) }}</span></div>
                  <div class="flex justify-between text-slate-600 dark:text-slate-300"><span>مصاريف سحب:</span><span class="font-bold tabular-nums">{{ store.money(acc.balance.withdrawalFees) }}</span></div>
                </div>
              </div>

              <!-- وصله كام من مين -->
              <div>
                <h4 class="text-xs font-extrabold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600">group</mat-icon>
                  <span>وصله كام ومن مين؟</span>
                </h4>
                @if (acc.receivedFrom.length === 0) {
                  <p class="text-[11px] text-slate-400">لسه مفيش فلوس مسجلة واصلة له.</p>
                } @else {
                  <div class="space-y-1">
                    @for (src of acc.receivedFrom; track src.name) {
                      <div class="flex justify-between text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                        <span class="font-bold text-slate-700 dark:text-slate-200">{{ src.name }}</span>
                        <span class="font-black tabular-nums text-emerald-600">{{ store.money(src.amount) }}</span>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- السلف اللي اداها -->
              <div>
                <h4 class="text-xs font-extrabold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-600">payments</mat-icon>
                  <span>السلف اللي اداها للناس ({{ acc.advances.length }} سلفة — {{ store.money(acc.balance.advancesPaid) }})</span>
                </h4>
                @if (acc.advances.length === 0) {
                  <p class="text-[11px] text-slate-400">لسه مفيش سلف مسجلة من حسابه.</p>
                } @else {
                  <div class="space-y-1 max-h-44 overflow-y-auto">
                    @for (adv of acc.advances; track $index) {
                      <div class="flex flex-wrap justify-between gap-1 text-xs bg-slate-50 dark:bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                        <span class="font-bold text-slate-700 dark:text-slate-200">{{ adv.workerName }} · {{ adv.date }}</span>
                        <span class="font-black tabular-nums text-rose-600">-{{ store.money(adv.amount) }}</span>
                        <span class="w-full text-[10px] text-slate-500">
                          سحبها: {{ adv.withdrawnBy || '—' }} · رسوم سحب: {{ store.money(adv.fee) }} · من: {{ adv.paidFrom }}
                          @if (adv.reason) { · {{ adv.reason }} }
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- كشف الحركة الكامل -->
              <div>
                <h4 class="text-xs font-extrabold text-slate-800 dark:text-slate-100 mb-1.5 flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-[#3390EC]">swap_vert</mat-icon>
                  <span>كشف حركة الأمين بالكامل ({{ acc.movements.length }} حركة)</span>
                </h4>
                @if (acc.movements.length === 0) {
                  <p class="text-[11px] text-slate-400">لسه مفيش حركات مسجلة على الأمين ده.</p>
                } @else {
                  <div class="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto rounded-xl border border-slate-100 dark:border-slate-800">
                    @for (mv of acc.movements; track $index) {
                      <div class="flex items-start justify-between gap-2 px-3 py-2 text-xs">
                        <div class="min-w-0">
                          <div class="font-extrabold text-slate-800 dark:text-slate-100">{{ mv.label }}</div>
                          <div class="text-slate-500 truncate">{{ mv.fromTo }}</div>
                          @if (mv.notes) {
                            <div class="text-slate-400 truncate">{{ mv.notes }}</div>
                          }
                          <div class="text-[10px] text-slate-400">{{ mv.date }}</div>
                        </div>
                        <div class="flex items-center gap-1.5 shrink-0">
                          <span
                            class="font-black tabular-nums"
                            [class.text-emerald-600]="mv.kind === 'in'"
                            [class.text-rose-600]="mv.kind === 'out'"
                          >
                            {{ mv.kind === 'in' ? '+' : '-' }}{{ store.money(mv.amount) }}
                          </span>
                          @if (mv.transferId !== undefined) {
                            <button
                              type="button"
                              (click)="deleteTransfer(mv.transferId)"
                              title="حذف الحركة"
                              class="w-6 h-6 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 flex items-center justify-center cursor-pointer"
                            >
                              <mat-icon class="!w-4 !h-4 !text-[16px]">delete</mat-icon>
                            </button>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class CustodiansPage {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly custodians = CUSTODIANS;
  readonly saving = signal(false);
  readonly formError = signal<string | null>(null);

  readonly moveForm = this.fb.group({
    kind: ['transfer'],
    date: [this.store.todayIso(), Validators.required],
    fromCustodian: ['mahmoud_ayman' as CustodianId, Validators.required],
    fromName: [''],
    toCustodian: ['mahmoud_hamada' as CustodianId, Validators.required],
    toName: [''],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    withdrawalFee: [0],
    method: ['فودافون كاش'],
    notes: [''],
  });

  /** حساب كل أمين: الأرقام من store.custodianBalances()، والتفاصيل من السجلات الفعلية. */
  readonly accounts = computed((): CustodianAccount[] => {
    const result = this.store.custodianBalances();
    const workerName = new Map<number, string>(
      this.store.workers().map((w) => [w.id as number, w.name])
    );
    const nameOf = (id: number | undefined): string =>
      (id !== undefined && workerName.get(id)) || 'عامل غير معروف';

    const accs = new Map<CustodianId, CustodianAccount>();
    for (const id of BUCKETS) {
      const sb =
        result.balances.find((b) => b.custodian === id) ??
        ({
          custodian: id,
          name: custodianLabel(id),
          received: 0,
          paid: 0,
          advancesPaid: 0,
          withdrawalFees: 0,
          balance: 0,
          vodafoneBalance: 0,
          pocketBalance: 0,
        } satisfies CustodianBalance);
      accs.set(id, {
        id,
        name: id === 'other' ? 'أخرى (أي أمين إضافي)' : custodianLabel(id),
        otherNames: [],
        balance: sb,
        transfersIn: 0,
        transfersOut: 0,
        pocketWithdrawals: 0,
        pocketWithdrawalsFees: 0,
        settlementsPaid: 0,
        nashPaid: 0,
        externalExpenses: 0,
        receivedFrom: [],
        advances: [],
        movements: [],
      });
    }
    const acc = (id: CustodianId | string | undefined): CustodianAccount | null => {
      const b = bucketOf(id);
      return b ? accs.get(b)! : null;
    };
    const receivedFromMap = new Map<CustodianId, Map<string, number>>();
    for (const id of BUCKETS) receivedFromMap.set(id, new Map());
    const addReceivedFrom = (id: CustodianId | string | undefined, name: string, amount: number) => {
      const b = bucketOf(id);
      if (!b || amount <= 0) return;
      const m = receivedFromMap.get(b)!;
      m.set(name, (m.get(name) || 0) + amount);
    };
    const pushMove = (id: CustodianId | string | undefined, mv: CustodianMovement) => {
      const a = acc(id);
      if (a) a.movements.push(mv);
    };
    const trackOtherName = (id: CustodianId | string | undefined, customName?: string) => {
      const a = acc(id);
      const n = (customName || '').trim();
      if (a && a.id === 'other' && n && !a.otherNames.includes(n)) a.otherNames.push(n);
    };

    // ── تحويلات بين الأمناء وسحب الجيب ──
    for (const tr of this.store.custodianTransfers()) {
      if (tr.kind === 'transfer') {
        const to = acc(tr.toCustodian);
        if (to) to.transfersIn += tr.amount || 0;
        const from = acc(tr.fromCustodian);
        if (from) from.transfersOut += tr.amount || 0;
        addReceivedFrom(
          tr.toCustodian,
          `تحويل من أمين: ${custodianLabel(tr.fromCustodian, tr.fromCustodianName)}`,
          tr.amount || 0
        );
        trackOtherName(tr.fromCustodian, tr.fromCustodianName);
        trackOtherName(tr.toCustodian, tr.toCustodianName);
        pushMove(tr.toCustodian, {
          date: tr.date,
          kind: 'in',
          label: 'تحويل وارد من أمين',
          fromTo: `${custodianLabel(tr.fromCustodian, tr.fromCustodianName)} ← ${custodianLabel(tr.toCustodian, tr.toCustodianName)}`,
          amount: tr.amount || 0,
          notes: tr.notes || '',
          transferId: tr.id,
        });
        pushMove(tr.fromCustodian, {
          date: tr.date,
          kind: 'out',
          label: 'تحويل صادر لأمين',
          fromTo: `${custodianLabel(tr.fromCustodian, tr.fromCustodianName)} ← ${custodianLabel(tr.toCustodian, tr.toCustodianName)}`,
          amount: tr.amount || 0,
          notes: tr.notes || '',
          transferId: tr.id,
        });
      } else {
        const a = acc(tr.fromCustodian);
        if (a) {
          a.pocketWithdrawals += tr.amount || 0;
          a.pocketWithdrawalsFees += tr.withdrawalFee || 0;
        }
        trackOtherName(tr.fromCustodian, tr.fromCustodianName);
        pushMove(tr.fromCustodian, {
          date: tr.date,
          kind: 'out',
          label: 'سحب للجيب من فودافون كاش',
          fromTo: `${custodianLabel(tr.fromCustodian, tr.fromCustodianName)} ← جيب ${custodianLabel(tr.fromCustodian, tr.fromCustodianName)}`,
          amount: tr.amount || 0,
          notes: `${tr.notes || ''}${tr.withdrawalFee ? ` (رسوم سحب: ${this.store.money(tr.withdrawalFee)})` : ''}`,
          transferId: tr.id,
        });
      }
    }

    // ── الوارد ──
    for (const p of this.store.incomingPayments()) {
      const a = acc(p.receivedBy);
      if (!a) continue;
      addReceivedFrom(
        p.receivedBy,
        `${p.sourceType || 'دفعة'}: ${p.sourceName || '—'}`,
        p.amount || 0
      );
      trackOtherName(p.receivedBy, p.receivedByName);
      pushMove(p.receivedBy, {
        date: p.date,
        kind: 'in',
        label: 'دفعة واردة',
        fromTo: `${p.sourceName || '—'} ← ${custodianLabel(p.receivedBy, p.receivedByName)}`,
        amount: p.amount || 0,
        notes: p.notes || '',
      });
    }
    for (const l of this.store.extractLines()) {
      if (!l.collected || l.collected <= 0) continue;
      const a = acc(l.collectedBy);
      if (!a) continue;
      const proj = this.store.projectName(
        l.extractId ? this.extractProjectId(l.extractId) : null
      );
      addReceivedFrom(l.collectedBy, `تحصيل مستخلص: ${proj}`, l.collected);
      trackOtherName(l.collectedBy, l.collectedByName);
      pushMove(l.collectedBy, {
        date: l.collectedDate || '',
        kind: 'in',
        label: 'تحصيل مستخلص',
        fromTo: `${proj} ← ${custodianLabel(l.collectedBy, l.collectedByName)}`,
        amount: l.collected,
        notes: l.notes || '',
      });
    }
    for (const c of this.store.checks()) {
      const a = acc(c.custodian);
      if (!a) continue;
      if (c.direction === 'وارد' && c.status === 'اتصرف') {
        addReceivedFrom(c.custodian, `شيك وارد #${c.number || '—'} (${c.bank || ''})`, c.amount || 0);
        pushMove(c.custodian, {
          date: c.dueDate || '',
          kind: 'in',
          label: 'شيك وارد اتصرف',
          fromTo: `شيك #${c.number || '—'} ← ${custodianLabel(c.custodian, c.custodianName)}`,
          amount: c.amount || 0,
          notes: c.notes || '',
        });
      }
      if (c.direction === 'صادر' && c.status === 'اتصرف') {
        pushMove(c.custodian, {
          date: c.dueDate || '',
          kind: 'out',
          label: 'شيك صادر اتصرف',
          fromTo: `${custodianLabel(c.custodian, c.custodianName)} ← شيك #${c.number || '—'}`,
          amount: c.amount || 0,
          notes: c.notes || '',
        });
      }
      trackOtherName(c.custodian, c.custodianName);
    }

    // ── المنصرف ──
    for (const adv of this.store.advances()) {
      const a = acc(adv.fundedBy);
      if (!a) continue;
      a.advances.push({
        workerName: nameOf(adv.workerId),
        amount: adv.amount || 0,
        date: adv.date,
        withdrawnBy: adv.withdrawnBy || '',
        fee: adv.withdrawalFee || 0,
        paidFrom: (adv.paidFrom ?? 'pocket') === 'vodafone' ? 'فودافون كاش' : 'الجيب',
        reason: adv.reason || '',
      });
      trackOtherName(adv.fundedBy, adv.fundedByName);
      pushMove(adv.fundedBy, {
        date: adv.date,
        kind: 'out',
        label: `سلفة (${(adv.paidFrom ?? 'pocket') === 'vodafone' ? 'من فودافون' : 'من الجيب'})`,
        fromTo: `${custodianLabel(adv.fundedBy, adv.fundedByName)} ← ${nameOf(adv.workerId)}`,
        amount: adv.amount || 0,
        notes: adv.notes || adv.reason || '',
      });
    }
    for (const s of this.store.settlements()) {
      const a = acc(s.paidBy);
      if (!a) continue;
      a.settlementsPaid += s.netPaid || 0;
      trackOtherName(s.paidBy, s.paidByName);
      pushMove(s.paidBy, {
        date: s.date,
        kind: 'out',
        label: `قبض / تسوية (${(s.paidFrom ?? 'pocket') === 'vodafone' ? 'من فودافون' : 'من الجيب'})`,
        fromTo: `${custodianLabel(s.paidBy, s.paidByName)} ← ${nameOf(s.workerId)}`,
        amount: s.netPaid || 0,
        notes: s.notes || '',
      });
    }
    for (const n of this.store.extraCashes()) {
      const a = acc(n.paidBy);
      if (!a) continue;
      a.nashPaid += n.paidCash || 0;
      trackOtherName(n.paidBy, n.paidByName);
      pushMove(n.paidBy, {
        date: '',
        kind: 'out',
        label: `ناش (${(n.paidFrom ?? 'pocket') === 'vodafone' ? 'من فودافون' : 'من الجيب'})`,
        fromTo: `${custodianLabel(n.paidBy, n.paidByName)} ← ${nameOf(n.workerId)}`,
        amount: n.paidCash || 0,
        notes: n.notes || '',
      });
    }
    for (const e of this.store.expenses()) {
      const a = acc(e.paidBy);
      if (!a) continue;
      a.externalExpenses += e.amount || 0;
      trackOtherName(e.paidBy, e.paidByName);
      pushMove(e.paidBy, {
        date: e.date,
        kind: 'out',
        label: `مصروف خارجي (${e.category}) (${(e.paidFrom ?? 'pocket') === 'vodafone' ? 'من فودافون' : 'من الجيب'})`,
        fromTo: `${custodianLabel(e.paidBy, e.paidByName)} ← ${this.store.projectName(e.projectId)}`,
        amount: e.amount || 0,
        notes: e.note || '',
      });
    }

    // ── التجميع النهائي ──
    const out: CustodianAccount[] = [];
    for (const id of BUCKETS) {
      const a = accs.get(id)!;
      a.receivedFrom = [...(receivedFromMap.get(id)?.entries() || [])]
        .map(([name, amount]) => ({ name, amount }))
        .sort((x, y) => y.amount - x.amount);
      a.advances.sort((x, y) => y.date.localeCompare(x.date));
      a.movements.sort((x, y) => y.date.localeCompare(x.date));
      out.push(a);
    }
    return out;
  });

  private extractProjectId(extractId: number): number | null {
    return this.store.extracts().find((e) => e.id === extractId)?.projectId ?? null;
  }

  onKindChange(): void {
    if (this.moveForm.get('kind')?.value === 'pocket') {
      this.moveForm.patchValue({ toCustodian: this.moveForm.get('fromCustodian')?.value });
    }
  }

  onFromChange(): void {
    if (this.moveForm.get('kind')?.value === 'pocket') {
      this.moveForm.patchValue({ toCustodian: this.moveForm.get('fromCustodian')?.value });
    }
  }

  async saveMovement(): Promise<void> {
    this.formError.set(null);
    if (this.moveForm.invalid) {
      this.formError.set('راجع البيانات: التاريخ والمبلغ مطلوبين، والمبلغ لازم يكون أكبر من صفر.');
      return;
    }
    const v = this.moveForm.getRawValue();
    const amount = Number(v.amount) || 0;
    const fee = Math.max(0, Number(v.withdrawalFee) || 0);
    if (amount <= 0) {
      this.formError.set('المبلغ لازم يكون أكبر من صفر.');
      return;
    }
    const kind = v.kind === 'pocket' ? 'pocket_withdrawal' : 'transfer';
    const from = v.fromCustodian as CustodianId;
    const to = (kind === 'pocket_withdrawal' ? from : v.toCustodian) as CustodianId;
    const fromName = from === 'other' ? (v.fromName || '').trim() : '';
    const toName = to === 'other' ? (v.toName || '').trim() : '';
    if (from === 'other' && !fromName) {
      this.formError.set('اكتب اسم الأمين (أخرى) في خانة «من».');
      return;
    }
    if (kind === 'transfer' && to === 'other' && !toName) {
      this.formError.set('اكتب اسم الأمين (أخرى) في خانة «إلى».');
      return;
    }
    if (kind === 'transfer' && from === to && from !== 'other') {
      this.formError.set('مينفعش تحوّل لنفس الأمين — اختار مستلم مختلف.');
      return;
    }
    if (kind === 'transfer' && from === 'other' && to === 'other' && fromName === toName) {
      this.formError.set('المُرسل والمستلم نفس الاسم — اختار مستلم مختلف.');
      return;
    }
    const fromLabel = custodianLabel(from, fromName);
    const toLabel = custodianLabel(to, toName);
    const transfer: CustodianTransfer = {
      date: v.date || this.store.todayIso(),
      kind,
      fromCustodian: from,
      fromCustodianName: fromName,
      toCustodian: to,
      toCustodianName: toName,
      amount,
      withdrawalFee: fee,
      method: v.method || 'فودافون كاش',
      notes: (v.notes || '').trim(),
    };

    this.saving.set(true);
    try {
      await this.store.addCustodianTransfer(transfer);
      this.store.showToast(
        kind === 'pocket_withdrawal'
          ? `تم تسجيل سحب ${this.store.money(amount)} من فودافون كاش لجيب ${fromLabel} — فودافون كاش بقى أقل، والجيب زاد`
          : `تم تسجيل تحويل ${this.store.money(amount)} من ${fromLabel} إلى ${toLabel} — حسابات الاتنين اتحدثت فوراً`,
        'success'
      );
      this.moveForm.patchValue({ amount: null, withdrawalFee: 0, notes: '' });
    } catch (err) {
      this.formError.set('حصل خطأ أثناء الحفظ — جرّب تاني. التفاصيل في سجل المتصفح.');
      console.error('save custodian movement failed', err);
    } finally {
      this.saving.set(false);
    }
  }

  async deleteTransfer(id: number): Promise<void> {
    await this.store.deleteCustodianTransfer(id);
    this.store.showToast('تم حذف الحركة وتحديث الحسابات', 'success');
  }
}
