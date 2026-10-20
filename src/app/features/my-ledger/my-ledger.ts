import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { StoreService } from '../../core/db/store';
import type { IncomingPayment, PaymentMethodType, PaymentSourceType } from '../../core/db/models';

@Component({
  selector: 'app-my-ledger',
  imports: [ReactiveFormsModule, RouterLink, MatIconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-5 pb-10 animate-fade-in">
      <!-- Hero Header: حسابي الشامل والخزنة -->
      <div
        class="relative overflow-hidden rounded-2xl bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-950 text-white p-4 sm:p-6 shadow-md border border-emerald-500/20"
      >
        <div class="relative z-10 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div class="space-y-1.5">
            <div class="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold">
              <mat-icon class="!w-4 !h-4 !text-[16px]">account_balance_wallet</mat-icon>
              <span>كشف حساب المقاول الشامل · الخزنة والمشاريع والأرباح</span>
            </div>
            <h2 class="text-xl sm:text-2xl font-extrabold tracking-tight">
              حسابي الشامل والخزنة التفصيلية
            </h2>
            <p class="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
              اعرف في لحظة واحدة: وصلني كام (من شيكات أو من شركة أو من شخص) وراح لحساب مشروع إيه، واتصرف كام (سلف وقبض وناش ومصاريف)، وليّا كام بره، وعليّا كام، وصافي ربحي في كل مشروع.
            </p>
          </div>

          <div class="flex flex-wrap items-center gap-2 relative">
            <button
              type="button"
              (click)="openAddPaymentModal()"
              class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-extrabold text-xs sm:text-sm shadow-sm transition-all cursor-pointer active:scale-95"
            >
              <mat-icon class="!w-5 !h-5 !text-[20px]">add_card</mat-icon>
              <span>تسجيل دفعة وصلتني</span>
            </button>

            <button
              type="button"
              (click)="store.openPocketSheet()"
              class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs sm:text-sm transition-all cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">account_balance_wallet</mat-icon>
              <span>سحبة الشيك وباقي جيبك ({{ store.money(store.dailyPocketSummary().remainingBeforeExpenses) }})</span>
            </button>

            <button
              type="button"
              (click)="store.showZakiCapabilitiesModal.set(true)"
              class="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-xs sm:text-sm border border-white/15 transition-all cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[18px] text-amber-400">smart_toy</mat-icon>
              <span>قدرات ذكي</span>
            </button>

            <!-- Three-Dots (⋮) More Actions Menu in My Ledger Header -->
            <button
              type="button"
              (click)="headerMoreOpen.set(!headerMoreOpen())"
              aria-label="المزيد من خيارات الخزنة وحسابي الشامل"
              class="min-w-[42px] min-h-[42px] px-2.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 inline-flex items-center justify-center gap-1 text-xs font-extrabold cursor-pointer"
            >
              <mat-icon class="!w-5 !h-5 !text-[20px]">more_vert</mat-icon>
              <span class="hidden sm:inline">خيارات</span>
            </button>

            @if (headerMoreOpen()) {
              <div
                class="absolute left-0 top-13 w-64 rounded-2xl bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-xl p-2 z-30 space-y-1"
              >
                <button
                  type="button"
                  (click)="copyFullLedgerWhatsApp(); headerMoreOpen.set(false)"
                  class="w-full text-right px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600">share</mat-icon>
                  <span>نسخ كشف حسابي الشامل للواتساب</span>
                </button>
                <button
                  type="button"
                  (click)="activeTab.set('methodology'); headerMoreOpen.set(false)"
                  class="w-full text-right px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-500">analytics</mat-icon>
                  <span>مناهج المقاولات ومحاكي الأرباح</span>
                </button>
                <button
                  type="button"
                  (click)="printLedgerPage(); headerMoreOpen.set(false)"
                  class="w-full text-right px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-blue-500">print</mat-icon>
                  <span>طباعة كشف الخزنة والمشاريع</span>
                </button>
                <a
                  routerLink="/checks"
                  (click)="headerMoreOpen.set(false)"
                  class="w-full text-right px-3 py-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-bold flex items-center gap-2"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-purple-500">account_balance</mat-icon>
                  <span>فتح دفتر الشيكات</span>
                </a>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Top 5 Master Financial Summary Cards (وصلني كام · اتصرف كام · ليا كام · عليا كام · صافي الربح والخزنة) -->
      @let ledger = store.comprehensiveLedger();
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3.5">
        <!-- 1. إجمالي اللي وصلني -->
        <div
          class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-emerald-500/30 shadow-sm flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-extrabold text-emerald-700 dark:text-emerald-400">
                ١. إجمالي اللي وصلني فعلياً
              </span>
              <div class="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                <mat-icon class="!w-5 !h-5 !text-[20px]">south_west</mat-icon>
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
              {{ store.money(ledger.totalReceivedAllSources) }}
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-bold">
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>من شركات ومستخلصات:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.receivedFromCompanies) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>من شيكات اتصرفت:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.receivedFromChecks) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>من أشخاص مباشر:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.receivedFromPersons) }}</span>
            </div>
          </div>
        </div>

        <!-- 2. إجمالي اللي اتصرف -->
        <div
          class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-rose-500/30 shadow-sm flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-extrabold text-rose-700 dark:text-rose-400">
                ٢. إجمالي اللي اتصرف (سلف وقبض)
              </span>
              <div class="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
                <mat-icon class="!w-5 !h-5 !text-[20px]">north_east</mat-icon>
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-rose-600 dark:text-rose-400 tabular-nums">
              {{ store.money(ledger.totalSpentAll) }}
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-bold">
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>سلف للعمال:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalAdvancesPaid) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>قبض وتسويات يوم ١٥:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalSettlementsPaid) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>مصاريف + ناش نقدي:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalExternalExpenses + ledger.totalNashCashPaid) }}</span>
            </div>
          </div>
        </div>

        <!-- 3. ليا كام بره -->
        <div
          class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-blue-500/30 shadow-sm flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-extrabold text-blue-700 dark:text-blue-400">
                ٣. ليّا بره (عند الشركات والشيكات)
              </span>
              <div class="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <mat-icon class="!w-5 !h-5 !text-[20px]">account_balance</mat-icon>
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-blue-600 dark:text-blue-400 tabular-nums">
              {{ store.money(ledger.totalOwedToMe) }}
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-bold">
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>باقي عند الشركات:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.owedToMeFromCompanies) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>شيكات واردة معلقة:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.pendingIncomingChecksTotal) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-500 dark:text-slate-400">
              <span>إجمالي شغل الشركة:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalCompanyEntitlement) }}</span>
            </div>
          </div>
        </div>

        <!-- 4. عليا كام للعمال والشيكات -->
        <div
          class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-amber-500/30 shadow-sm flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-extrabold text-amber-700 dark:text-amber-400">
                ٤. عليّا التزامات (للعمال والشيكات)
              </span>
              <div class="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
                <mat-icon class="!w-5 !h-5 !text-[20px]">engineering</mat-icon>
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black text-amber-600 dark:text-amber-400 tabular-nums">
              {{ store.money(ledger.totalOwedByMe) }}
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] font-bold">
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>باقي قبض للعمال:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.owedByMeToWorkers) }}</span>
            </div>
            <div class="flex items-center justify-between text-slate-600 dark:text-slate-300">
              <span>شيكات صادرة معلقة:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.pendingOutgoingChecksTotal) }}</span>
            </div>
            <div class="flex items-center justify-between text-emerald-600 dark:text-emerald-400">
              <span>خصومات وفرتها:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalDeductionsApplied) }}</span>
            </div>
          </div>
        </div>

        <!-- 5. صافي الربح والخزنة -->
        <div
          class="bg-gradient-to-br from-emerald-600 to-teal-700 text-white rounded-2xl p-4 shadow-sm flex flex-col justify-between"
        >
          <div>
            <div class="flex items-center justify-between gap-2 mb-2">
              <span class="text-xs font-extrabold text-emerald-100">
                ٥. صافي الربح والمكسب العام
              </span>
              <div class="w-8 h-8 rounded-xl bg-white/15 text-white flex items-center justify-center">
                <mat-icon class="!w-5 !h-5 !text-[20px]">trending_up</mat-icon>
              </div>
            </div>
            <div class="text-xl sm:text-2xl font-black tabular-nums">
              {{ store.money(ledger.totalNetProfit) }}
            </div>
          </div>
          <div class="mt-3 pt-2.5 border-t border-white/15 space-y-1 text-[11px] font-bold">
            <div class="flex items-center justify-between text-emerald-50">
              <span>السيولة بالخزنة الآن:</span>
              <span class="font-black tabular-nums">{{ store.money(ledger.netCashInHand) }}</span>
            </div>
            <div class="flex items-center justify-between text-emerald-100">
              <span>إجمالي يوميات العمال:</span>
              <span class="font-extrabold tabular-nums">{{ store.money(ledger.totalWorkerGrossWages) }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Segmented View Tabs (Mobile-Friendly, 4 Core Non-Redundant Tabs + Methodology in ⋮ Menu) -->
      <div class="bg-white dark:bg-slate-900 p-1.5 rounded-2xl border border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-1.5 shadow-sm">
        <button
          type="button"
          (click)="activeTab.set('projects')"
          class="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer"
          [class]="
            activeTab() === 'projects'
              ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          "
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">domain</mat-icon>
          <span class="truncate">حسابات المشاريع والخزنة ({{ store.num(ledger.projectBreakdowns.length) }})</span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('check-withdrawals')"
          class="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer"
          [class]="
            activeTab() === 'check-withdrawals'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/40'
          "
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">account_balance_wallet</mat-icon>
          <span class="truncate">ما تم سحبه من شيك المشروع والمتبقي</span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('incoming')"
          class="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer"
          [class]="
            activeTab() === 'incoming'
              ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          "
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">payments</mat-icon>
          <span class="truncate">إضافة رصيد ودفعات للمشاريع</span>
        </button>

        <button
          type="button"
          (click)="activeTab.set('movements')"
          class="flex items-center justify-center gap-1.5 py-2.5 px-2.5 rounded-xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer"
          [class]="
            activeTab() === 'movements'
              ? 'bg-slate-900 dark:bg-amber-500 text-white dark:text-slate-950 shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
          "
        >
          <mat-icon class="!w-4 !h-4 !text-[18px]">swap_vert</mat-icon>
          <span class="truncate">كشف حركة الخزنة ({{ store.num(ledger.movements.length) }})</span>
        </button>
      </div>

      <!-- TAB 1: حسابات المشاريع والخزنة (Project-by-Project Breakdown with 1-Click Quick Sheet & ⋮ Menu) -->
      @if (activeTab() === 'projects') {
        <div class="space-y-4">
          @if (ledger.projectBreakdowns.length === 0) {
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-8 text-center border border-slate-200 dark:border-slate-800">
              <mat-icon class="!w-12 !h-12 !text-[48px] text-slate-400 mx-auto mb-3">domain_disabled</mat-icon>
              <h3 class="text-base font-extrabold text-slate-800 dark:text-slate-100 mb-1">
                لا توجد مشاريع أو حركات مالية مسجلة بعد
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
                سجّل دفعة واردة وصلتك أو أضف مشروعاً جديداً ليظهر لك كشف الحساب التفصيلي لكل مشروع هنا.
              </p>
              <button
                type="button"
                (click)="openAddPaymentModal()"
                class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[18px]">add_card</mat-icon>
                <span>تسجيل أول دفعة وصلتني</span>
              </button>
            </div>
          } @else {
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              @for (pb of ledger.projectBreakdowns; track pb.projectId) {
                <div
                  (click)="store.openProjectSheet(pb.projectId)"
                  class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 hover:border-[#3390EC] shadow-sm overflow-hidden flex flex-col justify-between relative cursor-pointer transition-all"
                >
                  <!-- Project Card Header with Three-Dots (⋮) Button -->
                  <div class="p-4 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
                    <div class="flex items-center gap-2.5 min-w-0">
                      <div class="w-10 h-10 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                        <mat-icon class="!w-5 !h-5 !text-[22px]">apartment</mat-icon>
                      </div>
                      <div class="min-w-0">
                        <div class="flex items-center gap-1.5">
                          <h3 class="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white truncate">
                            {{ pb.projectName }}
                          </h3>
                          <span class="px-2 py-0.5 rounded-md bg-[#3390EC]/15 text-[#3390EC] text-[10px] font-extrabold shrink-0">
                            اضغط للتفاصيل
                          </span>
                        </div>
                        <p class="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                          حضور: {{ store.num(pb.daysWorked) }} يومية · {{ store.num(pb.nightsWorked) }} سهرة
                        </p>
                      </div>
                    </div>

                    <div class="flex items-center gap-2 shrink-0" (click)="$event.stopPropagation()">
                      <div class="text-left">
                        <div class="text-[10px] font-bold text-slate-500 dark:text-slate-400">صافي ربح المشروع</div>
                        <div
                          class="text-sm sm:text-base font-black tabular-nums"
                          [class]="pb.netProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'"
                        >
                          {{ store.money(pb.netProfit) }}
                        </div>
                      </div>

                      <!-- Three-Dots (⋮) Project Quick Actions Trigger -->
                      <button
                        type="button"
                        (click)="toggleProjectMenu(pb.projectName)"
                        [attr.aria-label]="'خيارات مشروع ' + pb.projectName"
                        class="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-amber-500 flex items-center justify-center text-slate-700 dark:text-slate-200 cursor-pointer"
                      >
                        <mat-icon class="!w-5 !h-5 !text-[20px]">more_vert</mat-icon>
                      </button>
                    </div>
                  </div>

                  @if (openProjectMenuName() === pb.projectName) {
                    <div
                      (click)="$event.stopPropagation()"
                      class="px-4 py-3 bg-amber-50/90 dark:bg-slate-800 border-b border-amber-300 dark:border-slate-700 flex flex-wrap items-center gap-2 animate-fade-in"
                    >
                      <button
                        type="button"
                        (click)="store.openProjectSheet(pb.projectId); openProjectMenuName.set(null)"
                        class="px-3 py-1.5 rounded-xl bg-[#3390EC] text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[15px]">layers</mat-icon>
                        <span>لوحة تفاصيل المشروع الكاملة</span>
                      </button>
                      <button
                        type="button"
                        (click)="openProjectCheckWithdrawals(pb.projectId); openProjectMenuName.set(null)"
                        class="px-3 py-1.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[15px]">account_balance_wallet</mat-icon>
                        <span>ما تم سحبه من شيك المشروع</span>
                      </button>
                      <button
                        type="button"
                        (click)="openAddPaymentModal(pb.projectId); openProjectMenuName.set(null)"
                        class="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[15px]">add_card</mat-icon>
                        <span>+ إضافة رصيد للمشروع</span>
                      </button>
                      <button
                        type="button"
                        (click)="copyProjectWhatsApp(pb); openProjectMenuName.set(null)"
                        class="px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[15px] text-emerald-600">share</mat-icon>
                        <span>نسخ واتساب</span>
                      </button>
                    </div>
                  }

                  <!-- Project 5-Metric Financial Strip (دخل كام · سحبنا من الشيك كام · طلع كام · قاعد كام · عليا كام) -->
                  <div class="p-4 space-y-3">
                    <div class="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      <div class="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-500/20">
                        <div class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">دخل المشروع</div>
                        <div class="text-xs sm:text-sm font-black text-emerald-700 dark:text-emerald-400 tabular-nums mt-0.5">
                          {{ store.money(pb.totalReceivedForProject) }}
                        </div>
                      </div>

                      <div class="p-2.5 rounded-xl bg-purple-50/70 dark:bg-purple-950/30 border border-purple-500/20">
                        <div class="text-[10px] font-bold text-purple-700 dark:text-purple-300">مسحوب من الشيكات</div>
                        <div class="text-xs sm:text-sm font-black text-purple-700 dark:text-purple-400 tabular-nums mt-0.5">
                          {{ store.money(pb.checksWithdrawnAmount || 0) }}
                        </div>
                      </div>

                      <div class="p-2.5 rounded-xl bg-rose-50/70 dark:bg-rose-950/30 border border-rose-500/20">
                        <div class="text-[10px] font-bold text-rose-700 dark:text-rose-300">طلع (سلف ومصاريف)</div>
                        <div class="text-xs sm:text-sm font-black text-rose-700 dark:text-rose-400 tabular-nums mt-0.5">
                          {{ store.money(pb.totalSpentInProject) }}
                        </div>
                      </div>

                      <div class="p-2.5 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-500/20">
                        <div class="text-[10px] font-bold text-blue-700 dark:text-blue-300">قاعد بخزنة المشروع</div>
                        <div class="text-xs sm:text-sm font-black text-blue-700 dark:text-blue-400 tabular-nums mt-0.5">
                          {{ store.money(pb.cashFlowBalance) }}
                        </div>
                      </div>

                      <div class="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-500/20 col-span-2 sm:col-span-1">
                        <div class="text-[10px] font-bold text-amber-700 dark:text-amber-300">عليّا للعمال</div>
                        <div class="text-xs sm:text-sm font-black text-amber-700 dark:text-amber-400 tabular-nums mt-0.5">
                          {{ store.money(pb.owedByMeInProject) }}
                        </div>
                      </div>
                    </div>

                    <!-- Detailed Breakdown Rows -->
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                      <!-- Incoming Details -->
                      <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5 text-xs">
                        <div class="font-extrabold text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                          <mat-icon class="!w-4 !h-4 !text-[16px]">south_west</mat-icon>
                          <span>تفاصيل اللي دخل لحساب المشروع:</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>من شركة / مستخلصات:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.receivedFromCompanies + pb.receivedFromExtracts) }}</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>من شيكات محصلة / مسحوبة:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.receivedFromChecks) }}</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>من أشخاص / نقدي مباشر:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.receivedFromPersons) }}</span>
                        </div>
                        <div class="flex justify-between text-blue-600 dark:text-blue-400 pt-1 border-t border-slate-200/70 dark:border-slate-700">
                          <span>باقي ليّا عند الشركة:</span>
                          <span class="font-extrabold tabular-nums">{{ store.money(pb.owedToMeInProject) }}</span>
                        </div>
                      </div>

                      <!-- Outgoing Details -->
                      <div class="rounded-xl bg-slate-50 dark:bg-slate-800/50 p-3 space-y-1.5 text-xs">
                        <div class="font-extrabold text-rose-700 dark:text-rose-400 flex items-center gap-1">
                          <mat-icon class="!w-4 !h-4 !text-[16px]">north_east</mat-icon>
                          <span>تفاصيل اللي طلع من المشروع:</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>اتصرف سلف للعمال:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.advancesSpent) }}</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>اتصرف قبض وتسويات:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.settlementsPaid) }}</span>
                        </div>
                        <div class="flex justify-between text-slate-600 dark:text-slate-300">
                          <span>مصاريف خارجية ورسوم سحب:</span>
                          <span class="font-bold tabular-nums">{{ store.money(pb.nashPaid + pb.expensesSpent) }}</span>
                        </div>
                        <div class="flex justify-between text-amber-600 dark:text-amber-400 pt-1 border-t border-slate-200/70 dark:border-slate-700">
                          <span>أجور العمال الكلية بالمشروع:</span>
                          <span class="font-extrabold tabular-nums">{{ store.money(pb.workerGrossWages) }}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <!-- Project Card Footer Actions -->
                  <div
                    (click)="$event.stopPropagation()"
                    class="px-4 py-3 bg-slate-50/80 dark:bg-slate-800/40 border-t border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2"
                  >
                    <button
                      type="button"
                      (click)="store.openProjectSheet(pb.projectId)"
                      class="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#3390EC] hover:underline cursor-pointer"
                    >
                      <mat-icon class="!w-4 !h-4 !text-[16px]">open_in_new</mat-icon>
                      <span>عرض كشف المشروع الكامل في لوحة سريعة</span>
                    </button>

                    <div class="flex items-center gap-1.5">
                      <button
                        type="button"
                        (click)="openProjectCheckWithdrawals(pb.projectId)"
                        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-bold cursor-pointer"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">account_balance_wallet</mat-icon>
                        <span>ما تم سحبه من الشيك</span>
                      </button>
                      <button
                        type="button"
                        (click)="openAddPaymentModal(pb.projectId)"
                        class="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-800 dark:text-slate-100 text-[11px] font-bold cursor-pointer"
                      >
                        <mat-icon class="!w-3.5 !h-3.5 !text-[14px]">add</mat-icon>
                        <span>+ رصيد</span>
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- TAB 2: صفحة ما تم سحبه من شيك المشروع والمنصرف سلف ومصاريف والمتبقي (100% Data-Driven) -->
      @if (activeTab() === 'check-withdrawals') {
        @let pk = store.dailyPocketSummary();
        <div class="space-y-4">
          <div class="bg-white dark:bg-slate-900 rounded-2xl border-2 border-emerald-500/40 p-4 sm:p-5 shadow-sm space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <mat-icon>account_balance_wallet</mat-icon>
                </div>
                <div>
                  <h3 class="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    كشف ما تم سحبه من شيك المشروع والمدفوع سلف ومصاريف والمتبقي
                  </h3>
                  <p class="text-xs text-slate-500 dark:text-slate-400">
                    محسوب تلقائياً ١٠٠٪ من السجلات الفعلية (الشيكات المسجلة · السلف · القبض · المصاريف الخارجية ورسوم السحب)
                  </p>
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <!-- Filter by Project -->
                <select
                  aria-label="تصفية حسب المشروع"
                  [value]="store.pocketSelectedProjectId() ?? ''"
                  (change)="store.pocketSelectedProjectId.set($any($event.target).value ? +$any($event.target).value : null); store.pocketSelectedCheckId.set(null)"
                  class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-extrabold"
                >
                  <option value="">كل المشاريع ({{ store.num(store.projects().length) }})</option>
                  @for (p of store.projects(); track p.id) {
                    <option [value]="p.id">{{ p.name }}</option>
                  }
                </select>

                <!-- Filter by Check -->
                <select
                  aria-label="تصفية حسب الشيك"
                  [value]="store.pocketSelectedCheckId() ?? ''"
                  (change)="onSelectCheckForWithdrawal($any($event.target).value ? +$any($event.target).value : null)"
                  class="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-extrabold"
                >
                  <option value="">كل شيكات المشروع الواردة</option>
                  @for (c of pk.projectChecks; track c.id) {
                    <option [value]="c.id">شيك #{{ c.number }} ({{ store.money(c.amount) }} - {{ store.projectName(c.projectId) }})</option>
                  }
                </select>

                <button
                  type="button"
                  (click)="store.openPocketSheet(store.pocketSelectedCheckId(), store.pocketSelectedProjectId())"
                  class="px-3.5 py-2 rounded-xl bg-[#3390EC] text-white text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">layers</mat-icon>
                  <span>فتح في لوحة سريعة</span>
                </button>
              </div>
            </div>

            <!-- Methodological Explanatory Banner: نظام الحسابين المنفصلين -->
            <div class="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs">
              <mat-icon class="!w-5 !h-5 !text-[20px] text-amber-600 shrink-0 mt-0.5">account_balance</mat-icon>
              <div class="leading-relaxed">
                <strong class="text-amber-900 dark:text-amber-300">نظام الحسابين المنفصلين (البنك والجيب):</strong>
                <span class="text-slate-700 dark:text-slate-300 mr-1">
                  فلوس شيك الشركة في حساب البنك مفصولة تماماً عن حركة الكاش والسلف في جيبك؛ لمعرفة رصيد الشيك بالبنك بدقة، وما يتبقى في جيبك كاش بعد خصم السلف والمصاريف الخارجية المسجلة.
                </span>
              </div>
            </div>

            <!-- TWO SYSTEMATIC TIERS: TIER 1 (BANK & CHECK) vs TIER 2 (CASH IN POCKET & ADVANCES) -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <!-- المستوى الأول: حساب البنك ورصيد شيك الشركة -->
              <div class="p-4 rounded-2xl bg-blue-50/70 dark:bg-blue-950/20 border-2 border-blue-400/40 space-y-3">
                <div class="flex items-center justify-between pb-2 border-b border-blue-200/60 dark:border-blue-900/60">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <mat-icon class="!w-4 !h-4 !text-[18px]">account_balance</mat-icon>
                    </div>
                    <div>
                      <h4 class="text-xs sm:text-sm font-black text-blue-950 dark:text-blue-100">
                        ١. حساب البنك وشيك الشركة
                      </h4>
                      <div class="text-[10px] text-blue-600 dark:text-blue-300 font-bold">
                        رصيد الشيك المصروف في البنك
                      </div>
                    </div>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-blue-600/15 text-blue-700 dark:text-blue-300 text-[10px] font-black">
                    دورة شيك البنك
                  </span>
                </div>

                <div class="grid grid-cols-3 gap-2">
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800">
                    <div class="text-[10px] font-bold text-slate-500">قيمة الشيك بالبنك</div>
                    <div class="text-sm sm:text-base font-black text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {{ store.money(pk.checksIncomingTotal) }}
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5">{{ store.num(pk.projectChecks.length) }} شيك وارد</div>
                  </div>

                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800">
                    <div class="text-[10px] font-bold text-blue-700 dark:text-blue-300">سحبت كاش منه</div>
                    <div class="text-sm sm:text-base font-black text-blue-600 tabular-nums mt-0.5">
                      {{ store.money(pk.withdrawnAmount) }}
                    </div>
                    <div class="text-[9px] text-slate-500 mt-0.5">خرج لجيب المقاول</div>
                  </div>

                  <div class="p-2.5 rounded-xl bg-blue-600 text-white shadow-xs">
                    <div class="text-[10px] font-bold text-blue-100">باقي بالشيك في البنك</div>
                    <div class="text-sm sm:text-base font-black tabular-nums mt-0.5">
                      {{ store.money(pk.remainingInBank) }}
                    </div>
                    <div class="text-[9px] text-blue-100 mt-0.5">في حساب الشركة</div>
                  </div>
                </div>

                <!-- Live Formula Badge for Bank -->
                <div class="p-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-blue-200/70 dark:border-blue-800/70 text-[11px] font-bold text-blue-900 dark:text-blue-200 flex items-center justify-between">
                  <span>حساب البنك:</span>
                  <span class="tabular-nums font-black" dir="ltr">
                    {{ store.money(pk.checksIncomingTotal) }} - {{ store.money(pk.withdrawnAmount) }} = {{ store.money(pk.remainingInBank) }}
                  </span>
                </div>
              </div>

              <!-- المستوى الثاني: عهدة الكاش في جيبك (فلوس السلف والمصاريف) -->
              <div class="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/20 border-2 border-emerald-400/40 space-y-3">
                <div class="flex items-center justify-between pb-2 border-b border-emerald-200/60 dark:border-emerald-900/60">
                  <div class="flex items-center gap-2">
                    <div class="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                      <mat-icon class="!w-4 !h-4 !text-[18px]">payments</mat-icon>
                    </div>
                    <div>
                      <h4 class="text-xs sm:text-sm font-black text-emerald-950 dark:text-emerald-100">
                        ٢. عهدة الكاش في جيبك
                      </h4>
                      <div class="text-[10px] text-emerald-600 dark:text-emerald-300 font-bold">
                        فلوس السلف والمصاريف بعد السحب من البنك
                      </div>
                    </div>
                  </div>
                  <span class="px-2.5 py-0.5 rounded-full bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 text-[10px] font-black">
                    دورة كاش الجيب
                  </span>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                    <div class="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">الكاش المسحوب في جيبك</div>
                    <div class="text-sm sm:text-base font-black text-emerald-600 tabular-nums mt-0.5">
                      {{ store.money(pk.withdrawnAmount) }}
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5">عهدة نقدية بيدك</div>
                  </div>

                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                    <div class="text-[10px] font-bold text-amber-700 dark:text-amber-300">سلف وقبض عمال</div>
                    <div class="text-sm sm:text-base font-black text-amber-600 tabular-nums mt-0.5">
                      {{ store.money(pk.totalWorkersPaid) }}
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5">سلف: {{ store.money(pk.advancesTotal) }}</div>
                  </div>

                  <div class="p-2.5 rounded-xl bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800">
                    <div class="text-[10px] font-bold text-rose-700 dark:text-rose-300">مصاريف خارجية ورسوم</div>
                    <div class="text-sm sm:text-base font-black text-rose-600 tabular-nums mt-0.5">
                      {{ store.money(pk.totalExternalExpenses) }}
                    </div>
                    <div class="text-[9px] text-slate-400 mt-0.5">سحب: {{ store.money(pk.withdrawalFee) }}</div>
                  </div>

                  <div class="p-2.5 rounded-xl bg-emerald-600 text-white shadow-xs">
                    <div class="text-[10px] font-bold text-emerald-100">باقي في جيبك الآن</div>
                    <div class="text-sm sm:text-base font-black tabular-nums mt-0.5">
                      {{ store.money(pk.netRemainingInPocket) }}
                    </div>
                    <div class="text-[9px] text-emerald-100 mt-0.5">قبل المصاريف: {{ store.money(pk.remainingBeforeExpenses) }}</div>
                  </div>
                </div>

                <!-- Live Formula Badge for Pocket -->
                <div class="p-2 rounded-xl bg-white/70 dark:bg-slate-900/60 border border-emerald-200/70 dark:border-emerald-800/70 text-[11px] font-bold text-emerald-900 dark:text-emerald-200 flex items-center justify-between">
                  <span>كاش الجيب:</span>
                  <span class="tabular-nums font-black" dir="ltr">
                    {{ store.money(pk.withdrawnAmount) }} - {{ store.money(pk.totalWorkersPaid) }} - {{ store.money(pk.totalExternalExpenses) }} = {{ store.money(pk.netRemainingInPocket) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Record / Update Check Withdrawal Form Linked to Project -->
            <div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 space-y-3">
              <div class="flex flex-wrap items-center justify-between gap-2">
                <div class="text-xs font-extrabold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
                  <mat-icon class="!w-4 !h-4 !text-[16px] text-emerald-600">edit_note</mat-icon>
                  <span>تسجيل / تحديث المبلغ المسحوب من شيك المشروع ورسوم السحب</span>
                </div>
                <span class="text-[11px] text-slate-500">
                  يتم الحفظ مباشرة على شيك المشروع وتحديث المتبقي في الخزنة تلقائياً
                </span>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                <div>
                  <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">الشيك / المشروع</label>
                  <select
                    [value]="store.pocketSelectedCheckId() ?? ''"
                    (change)="onSelectCheckForWithdrawal($any($event.target).value ? +$any($event.target).value : null)"
                    class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-bold"
                  >
                    <option value="">اختر الشيك المسحوب منه...</option>
                    @for (c of store.checks(); track c.id) {
                      @if (c.direction === 'وارد') {
                        <option [value]="c.id">
                          شيك #{{ c.number }} ({{ store.money(c.amount) }} - {{ store.projectName(c.projectId) }})
                        </option>
                      }
                    }
                  </select>
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">المبلغ المسحوب من الشيك (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    [value]="store.pocketWithdrawnAmount() || pk.withdrawnAmount"
                    (input)="store.pocketWithdrawnAmount.set(+$any($event.target).value)"
                    placeholder="مثلاً: 4000"
                    class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-black tabular-nums"
                  />
                </div>

                <div>
                  <label class="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-1">مصاريف / رسوم السحب (ج.م)</label>
                  <input
                    type="number"
                    min="0"
                    [value]="store.pocketWithdrawalFee() || pk.withdrawalFee"
                    (input)="store.pocketWithdrawalFee.set(+$any($event.target).value)"
                    placeholder="مثلاً: 40"
                    class="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-black text-rose-600 tabular-nums"
                  />
                </div>

                <button
                  type="button"
                  (click)="store.savePocketWithdrawalToCheck(true)"
                  class="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[16px]">save</mat-icon>
                  <span>حفظ السحبة وربطها بالمشروع</span>
                </button>
              </div>
            </div>

            <!-- Live Lists: Project Checks + Advances Paid + External Expenses -->
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <!-- Column 1: الشيكات المسحوب منها -->
              <div class="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <mat-icon class="!w-4 !h-4 !text-[16px] text-purple-600">account_balance</mat-icon>
                    <span>شيكات المشروع ({{ store.num(pk.projectChecks.length) }})</span>
                  </h4>
                  <a routerLink="/checks" class="text-[11px] font-bold text-[#3390EC] hover:underline">+ شيك جديد</a>
                </div>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  @for (c of pk.projectChecks; track c.id) {
                    <div
                      (click)="store.openCheckSheet(c.id!)"
                      class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:border-purple-500 border border-transparent flex items-center justify-between text-xs cursor-pointer transition-all"
                    >
                      <div>
                        <div class="font-extrabold text-slate-900 dark:text-white">
                          شيك #{{ c.number }} · {{ store.projectName(c.projectId) }}
                        </div>
                        <div class="text-[11px] text-slate-500 flex flex-wrap items-center gap-2 mt-0.5">
                          <span>الشيك بالبنك: <strong>{{ store.money(c.amount) }}</strong></span>
                          <span>سُحب منه: <strong class="text-blue-600">{{ store.money(c.withdrawnAmount ?? 0) }}</strong></span>
                          <span>باقي بالبنك: <strong class="text-blue-700 dark:text-blue-300">{{ store.money(c.amount - (c.withdrawnAmount ?? 0)) }}</strong></span>
                        </div>
                      </div>
                      <span class="px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-600 font-bold text-[10px]">
                        التفاصيل
                      </span>
                    </div>
                  } @empty {
                    <div class="text-xs text-slate-400 py-4 text-center">لا توجد شيكات واردة مسجلة</div>
                  }
                </div>
              </div>

              <!-- Column 2: السلف والقبض المدفوعة من الشيك/المشروع -->
              <div class="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <mat-icon class="!w-4 !h-4 !text-[16px] text-amber-600">groups</mat-icon>
                    <span>السلف والقبض المسجلة ({{ store.num(pk.recordedAdvances.length + pk.recordedSettlements.length) }})</span>
                  </h4>
                  <a routerLink="/advances" class="text-[11px] font-bold text-[#3390EC] hover:underline">+ تسجيل سلفة</a>
                </div>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  @for (adv of pk.recordedAdvances; track adv.id) {
                    <div
                      (click)="store.openWorkerSheet(adv.workerId)"
                      class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:border-amber-500 border border-transparent flex items-center justify-between text-xs cursor-pointer transition-all"
                    >
                      <div>
                        <div class="font-extrabold text-slate-900 dark:text-white">
                          سلفة: {{ store.workerName(adv.workerId) }}
                        </div>
                        <div class="text-[11px] text-slate-500">
                          {{ store.digits(adv.date) }} · {{ adv.reason || store.projectName(adv.projectId) }}
                        </div>
                      </div>
                      <span class="font-black text-amber-600 tabular-nums">-{{ store.money(adv.amount) }}</span>
                    </div>
                  }
                  @for (st of pk.recordedSettlements; track st.id) {
                    <div
                      (click)="store.openWorkerSheet(st.workerId)"
                      class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:border-blue-500 border border-transparent flex items-center justify-between text-xs cursor-pointer transition-all"
                    >
                      <div>
                        <div class="font-extrabold text-slate-900 dark:text-white">
                          قبض تصفية: {{ store.workerName(st.workerId) }}
                        </div>
                        <div class="text-[11px] text-slate-500">{{ store.digits(st.date) }}</div>
                      </div>
                      <span class="font-black text-blue-600 tabular-nums">-{{ store.money(st.netPaid) }}</span>
                    </div>
                  }
                  @if (pk.recordedAdvances.length === 0 && pk.recordedSettlements.length === 0) {
                    <div class="text-xs text-slate-400 py-4 text-center">لا توجد سلف أو دفعات قبض مسجلة بعد</div>
                  }
                </div>
              </div>

              <!-- Column 3: المصاريف الخارجية ورسوم السحب -->
              <div class="rounded-2xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                <div class="flex items-center justify-between">
                  <h4 class="text-xs font-extrabold text-slate-900 dark:text-white flex items-center gap-1.5">
                    <mat-icon class="!w-4 !h-4 !text-[16px] text-rose-600">receipt_long</mat-icon>
                    <span>المصاريف الخارجية ({{ store.num(pk.recordedExpenses.length) }})</span>
                  </h4>
                  <a routerLink="/expenses" class="text-[11px] font-bold text-[#3390EC] hover:underline">+ تسجيل مصروف</a>
                </div>
                <div class="space-y-2 max-h-64 overflow-y-auto">
                  @for (exp of pk.recordedExpenses; track exp.id) {
                    <div
                      (click)="store.openProjectSheet(exp.projectId)"
                      class="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 hover:border-rose-500 border border-transparent flex items-center justify-between text-xs cursor-pointer transition-all"
                    >
                      <div>
                        <div class="font-extrabold text-slate-900 dark:text-white">{{ exp.category }}</div>
                        <div class="text-[11px] text-slate-500">
                          {{ store.digits(exp.date) }} · {{ exp.note || store.projectName(exp.projectId) }}
                        </div>
                      </div>
                      <span class="font-black text-rose-600 tabular-nums">-{{ store.money(exp.amount) }}</span>
                    </div>
                  } @empty {
                    <div class="text-xs text-slate-400 py-4 text-center">لا توجد مصاريف خارجية مسجلة</div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      }

      <!-- TAB 3: سجل الدفعات اللي وصلتني (Incoming Payments CRUD Linked to Any Project) -->
      @if (activeTab() === 'incoming') {
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">
                سجل الفلوس والدفعات والأرصدة المضافة للمشاريع
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                أي إضافة رصيد أو دفعة من شركة أو شيك أو مستخلص يمكنك ربطها بأي مشروع والضغط عليها لعرض كشف المشروع
              </p>
            </div>

            <button
              type="button"
              (click)="openAddPaymentModal()"
              class="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-xs cursor-pointer"
            >
              <mat-icon class="!w-4 !h-4 !text-[18px]">add_card</mat-icon>
              <span>+ إضافة رصيد / دفعة وربطها بمشروع</span>
            </button>
          </div>

          @if (store.incomingPayments().length === 0) {
            <div class="p-8 text-center">
              <mat-icon class="!w-12 !h-12 !text-[48px] text-slate-400 mx-auto mb-2">savings</mat-icon>
              <p class="text-sm font-bold text-slate-700 dark:text-slate-200 mb-1">
                لم تسجل دفعات واردة مباشرة بعد
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
                اضغط على "إضافة رصيد / دفعة وربطها بمشروع" لتسجيل أي مبلغ وصلك وربطه بالمشروع الخاص به
              </p>
              <button
                type="button"
                (click)="openAddPaymentModal()"
                class="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-extrabold text-xs cursor-pointer"
              >
                <mat-icon class="!w-4 !h-4 !text-[18px]">add</mat-icon>
                <span>تسجيل دفعة وصلتني الآن</span>
              </button>
            </div>
          } @else {
            <div class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (item of store.incomingPayments(); track item.id) {
                <div
                  (click)="store.openProjectSheet(item.projectId)"
                  class="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div class="flex items-start gap-3">
                    <div
                      class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold"
                      [class]="
                        item.sourceType === 'شيك'
                          ? 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                          : item.sourceType === 'شخص'
                            ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                            : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                      "
                    >
                      <mat-icon class="!w-5 !h-5 !text-[20px]">
                        {{
                          item.sourceType === 'شيك'
                            ? 'request_quote'
                            : item.sourceType === 'شخص'
                              ? 'person'
                              : 'business'
                        }}
                      </mat-icon>
                    </div>
                    <div class="space-y-0.5">
                      <div class="flex flex-wrap items-center gap-2">
                        <span class="text-sm font-extrabold text-slate-900 dark:text-white">
                          {{ item.sourceName }}
                        </span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          من {{ item.sourceType }} · {{ item.method }}
                        </span>
                        <span class="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-500/15 text-amber-700 dark:text-amber-300">
                          لحساب: {{ store.projectName(item.projectId) }}
                        </span>
                      </div>
                      <div class="text-xs text-slate-500 dark:text-slate-400">
                        التاريخ: {{ store.digits(item.date) }}
                        @if (item.checkNumber) {
                          <span> · شيك رقم: {{ store.digits(item.checkNumber) }}</span>
                        }
                        @if (item.notes) {
                          <span> · {{ item.notes }}</span>
                        }
                      </div>
                    </div>
                  </div>

                  <div
                    (click)="$event.stopPropagation()"
                    class="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-t-0 pt-2 sm:pt-0 border-slate-100 dark:border-slate-800"
                  >
                    <span class="text-base font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                      + {{ store.money(item.amount) }}
                    </span>

                    <div class="flex items-center gap-1">
                      <button
                        type="button"
                        (click)="editPayment(item)"
                        class="p-2 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/40 cursor-pointer"
                        title="تعديل"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[18px]">edit</mat-icon>
                      </button>
                      <button
                        type="button"
                        (click)="deletePayment(item.id!)"
                        class="p-2 rounded-lg text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                        title="حذف"
                      >
                        <mat-icon class="!w-4 !h-4 !text-[18px]">delete</mat-icon>
                      </button>
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- TAB 4: كشف حركة الخزنة الكامل (All Inflows & Outflows - Click Any Row for Quick Sheet) -->
      @if (activeTab() === 'movements') {
        <div class="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
          <div class="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 class="text-base font-extrabold text-slate-900 dark:text-white">
                كشف حركات الخزنة الموحد (الوارد والمنصرف — اضغط على أي حركة للتفاصيل)
              </h3>
              <p class="text-xs text-slate-500 dark:text-slate-400">
                يجمع تلقائياً كل الدفعات الواردة، الشيكات المحصلة، المستخلصات، السلف، التسويات، الناش، والمصاريف
              </p>
            </div>

            <div class="flex items-center gap-1.5">
              <button
                type="button"
                (click)="movementFilter.set('all')"
                class="px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors"
                [class]="movementFilter() === 'all' ? 'bg-slate-900 text-white dark:bg-amber-500 dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              >
                الكل
              </button>
              <button
                type="button"
                (click)="movementFilter.set('in')"
                class="px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors"
                [class]="movementFilter() === 'in' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              >
                اللي دخل (+)
              </button>
              <button
                type="button"
                (click)="movementFilter.set('out')"
                class="px-3 py-1.5 rounded-lg text-xs font-extrabold cursor-pointer transition-colors"
                [class]="movementFilter() === 'out' ? 'bg-rose-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'"
              >
                اللي طلع (-)
              </button>
            </div>
          </div>

          @if (filteredMovements().length === 0) {
            <div class="p-8 text-center text-xs font-bold text-slate-500 dark:text-slate-400">
              لا توجد حركات مالية مطابقة للفلتر المحدد حالياً.
            </div>
          } @else {
            <div class="divide-y divide-slate-100 dark:divide-slate-800">
              @for (mv of filteredMovements(); track mv.id) {
                <div
                  (click)="openMovementQuickSheet(mv)"
                  class="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 cursor-pointer transition-colors"
                >
                  <div class="flex items-center gap-3 min-w-0">
                    <div
                      class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      [class]="
                        mv.direction === 'in'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                      "
                    >
                      <mat-icon class="!w-5 !h-5 !text-[18px]">
                        {{ mv.direction === 'in' ? 'south_west' : 'north_east' }}
                      </mat-icon>
                    </div>
                    <div class="min-w-0">
                      <div class="flex flex-wrap items-center gap-1.5">
                        <span class="text-xs sm:text-sm font-extrabold text-slate-900 dark:text-white truncate">
                          {{ mv.title }}
                        </span>
                        <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                          {{ mv.category }}
                        </span>
                      </div>
                      <div class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {{ store.digits(mv.date) }} · المشروع: {{ mv.projectName }}
                        @if (mv.subtitle) {
                          <span> · {{ mv.subtitle }}</span>
                        }
                      </div>
                    </div>
                  </div>

                  <div class="flex items-center gap-2 shrink-0">
                    <div
                      class="text-sm sm:text-base font-black tabular-nums"
                      [class]="
                        mv.direction === 'in'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-rose-600 dark:text-rose-400'
                      "
                    >
                      {{ mv.direction === 'in' ? '+' : '-' }} {{ store.money(mv.amount) }}
                    </div>
                    <mat-icon class="!w-4 !h-4 !text-[16px] text-slate-400">chevron_left</mat-icon>
                  </div>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- TAB 4: الدليل المنهجي للمقاولات ومحاكي الأرباح الذكي -->
      @if (activeTab() === 'methodology') {
        <div class="space-y-5">
          <!-- Interactive Project Profit & Pricing Simulator -->
          <div class="bg-gradient-to-br from-slate-900 via-slate-900 to-emerald-950 text-white rounded-3xl p-5 sm:p-6 border border-emerald-500/30 shadow-md">
            <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-white/10">
              <div class="flex items-center gap-3">
                <div class="w-11 h-11 rounded-2xl bg-amber-500/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                  <mat-icon>calculate</mat-icon>
                </div>
                <div>
                  <h3 class="text-base sm:text-lg font-black text-white">
                    محاكي تسعير وأرباح المشاريع والمستخلصات الذكي
                  </h3>
                  <p class="text-xs text-slate-300">
                    احسب تكلفة العمالة والمصروفات وصافي الربح المتوقع قبل تسعير أي مقاولة أو مستخلص جديد
                  </p>
                </div>
              </div>
              <span class="px-3 py-1 rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-xs font-extrabold self-start sm:self-auto">
                أداة تخطيط هندسي ومالي
              </span>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-center">
              <div class="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    قيمة المقاولة / المستخلص (ج.م)
                  </label>
                  <input
                    type="number"
                    [value]="simContractValue()"
                    (input)="updateSimField('contract', $event)"
                    class="w-full bg-slate-950/70 border border-white/15 rounded-xl px-2.5 py-2 text-sm font-black text-amber-300 tabular-nums"
                  />
                </div>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    عدد الصنايعية والعمال
                  </label>
                  <input
                    type="number"
                    [value]="simWorkersCount()"
                    (input)="updateSimField('workers', $event)"
                    class="w-full bg-slate-950/70 border border-white/15 rounded-xl px-2.5 py-2 text-sm font-black text-white tabular-nums"
                  />
                </div>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    متوسط اليومية للعامل (ج.م)
                  </label>
                  <input
                    type="number"
                    [value]="simDailyWage()"
                    (input)="updateSimField('wage', $event)"
                    class="w-full bg-slate-950/70 border border-white/15 rounded-xl px-2.5 py-2 text-sm font-black text-white tabular-nums"
                  />
                </div>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-3">
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    مدة التنفيذ (أيام عمل)
                  </label>
                  <input
                    type="number"
                    [value]="simDaysCount()"
                    (input)="updateSimField('days', $event)"
                    class="w-full bg-slate-950/70 border border-white/15 rounded-xl px-2.5 py-2 text-sm font-black text-white tabular-nums"
                  />
                </div>

                <div class="bg-white/5 border border-white/10 rounded-2xl p-3 col-span-2">
                  <label class="block text-[11px] font-bold text-slate-300 mb-1">
                    مصاريف التشغيل والنقل والمعدات والخامات المتوقعة (ج.م)
                  </label>
                  <input
                    type="number"
                    [value]="simMaterialsCost()"
                    (input)="updateSimField('materials', $event)"
                    class="w-full bg-slate-950/70 border border-white/15 rounded-xl px-2.5 py-2 text-sm font-black text-rose-300 tabular-nums"
                  />
                </div>
              </div>

              <!-- Simulator Output Panel -->
              <div class="lg:col-span-5 bg-slate-950/80 border border-white/15 rounded-2xl p-4 space-y-3">
                <div class="flex items-center justify-between text-xs border-b border-white/10 pb-2.5">
                  <span class="text-slate-300 font-bold">إجمالي أجور العمالة ({{ store.digits(simResult().totalWorkDays) }} يومية):</span>
                  <span class="font-black text-rose-300 tabular-nums">{{ store.money(simResult().laborCost) }}</span>
                </div>
                <div class="flex items-center justify-between text-xs border-b border-white/10 pb-2.5">
                  <span class="text-slate-300 font-bold">إجمالي التكلفة الكلية للمشروع:</span>
                  <span class="font-black text-rose-400 tabular-nums">{{ store.money(simResult().totalCost) }}</span>
                </div>
                <div class="flex items-center justify-between text-xs border-b border-white/10 pb-2.5">
                  <span class="text-slate-300 font-bold">احتياطي طوارئ مقترح (10%):</span>
                  <span class="font-black text-amber-300 tabular-nums">{{ store.money(simResult().safetyReserve) }}</span>
                </div>
                <div class="pt-1 flex items-center justify-between">
                  <div>
                    <div class="text-[11px] text-slate-400 font-bold">صافي الربح المتوقع للمقاول</div>
                    <div
                      class="text-xl font-black tabular-nums"
                      [class]="simResult().netProfit >= 0 ? 'text-emerald-400' : 'text-rose-400'"
                    >
                      {{ store.money(simResult().netProfit) }}
                    </div>
                  </div>
                  <div class="text-left">
                    <div class="text-[11px] text-slate-400 font-bold">نسبة الربح</div>
                    <span
                      class="inline-block px-2.5 py-1 rounded-xl text-xs font-black tabular-nums"
                      [class]="
                        simResult().marginPercent >= 20
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'
                          : simResult().marginPercent > 0
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-400/30'
                            : 'bg-rose-500/20 text-rose-300 border border-rose-400/30'
                      "
                    >
                      {{ store.digits(simResult().marginPercent) }}% · {{ simResult().verdict }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 6 Golden Rules of Smart Contractor Financial & Site Management -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center font-black text-sm">1</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">منهجية الفصل بين السيولة والربح</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                السيولة النقدية في إيدك الآن (<strong>{{ store.money(store.comprehensiveLedger().netCashInHand) }}</strong>) تختلف عن صافي ربحك الدفتري (<strong>{{ store.money(store.comprehensiveLedger().overallNetProfit) }}</strong>). لا تصرف من دفعات المالك المقدمة كأنها ربح صافي قبل سداد متبقي الصنايعية.
              </p>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-black text-sm">2</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">قاعدة سقف السلف الأسبوعية (60%)</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                لا تسمح بأن تتجاوز سلف العامل خلال الأسبوع 60% من إجمالي يومياته المحققة حتى لا يتحول العامل إلى رصيد مدين. حالياً إجمالي السلف المنصرفة <strong>{{ store.money(store.comprehensiveLedger().totalAdvancesPaid) }}</strong>.
              </p>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center font-black text-sm">3</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">التحميل المباشر على مركز تكلفة المشروع</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                كل دفعة تصل من شيك أو شركة أو شخص وكل يومية أو مصروف يجب ربطها بمشروع محدد. هذا الكشف يكشف لك فوراً أي مشروع يربح وأي مشروع يستنزف الخزنة العامة.
              </p>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center font-black text-sm">4</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">المطابقة الإلزامية للأرقام والكميات</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                سواء كنت تسجل يوميات (يوم، نص يوم، يوم وربع، سهرة) أو مستخلصات بالمتر والمقطوعية، راجع دائماً إجمالي المستحق قبل التقفيل الأسبوعي وأرسل كشف الواتساب للعامل للتأكيد.
              </p>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-600 dark:text-rose-400 flex items-center justify-center font-black text-sm">5</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">متابعة الشيكات قيد التحصيل والاستقطاعات</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                الشيك قيد التحصيل لا يدخل في السيولة النقدية الفعلية إلا بعد صرفه. لديك حالياً <strong>{{ store.money(store.comprehensiveLedger().pendingIncomingChecksTotal) }}</strong> شيكات بالانتظار؛ تابع تواريخ استحقاقها أولاً بأول.
              </p>
            </div>

            <div class="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
              <div class="flex items-center gap-2.5">
                <div class="w-9 h-9 rounded-xl bg-teal-500/15 text-teal-600 dark:text-teal-400 flex items-center justify-center font-black text-sm">6</div>
                <h4 class="text-sm font-black text-slate-900 dark:text-white">الأوامر الذكية عبر المساعد زكي</h4>
              </div>
              <p class="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                بدلاً من البحث اليدوي، اسأل زكي بالعامية: <em>«قارن ربحية المشاريع»</em> أو <em>«كشف حساب عامل كريم»</em> أو <em>«منهجية الحسابات»</em> ليقوم بالتحليل الفوري لك.
              </p>
            </div>
          </div>
        </div>
      }

      <!-- Modal: تسجيل / تعديل دفعة واردة وصلتني -->
      @if (showPaymentModal()) {
        <div
          class="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          (click)="closePaymentModal()"
        >
          <div
            class="bg-white dark:bg-slate-900 w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl overflow-hidden max-h-[92vh] flex flex-col"
            (click)="$event.stopPropagation()"
          >
            <div class="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div class="flex items-center gap-2">
                <mat-icon class="text-amber-400">add_card</mat-icon>
                <h3 class="text-sm sm:text-base font-extrabold">
                  {{ editingPaymentId() ? 'تعديل دفعة واردة' : 'تسجيل دفعة وصلتني (شركة / شخص / شيك)' }}
                </h3>
              </div>
              <button
                type="button"
                (click)="closePaymentModal()"
                class="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <mat-icon>close</mat-icon>
              </button>
            </div>

            <form [formGroup]="paymentForm" (ngSubmit)="submitPayment()" class="p-4 space-y-3.5 overflow-y-auto">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    وصلني من مين؟ (نوع الجهة)
                  </label>
                  <select
                    formControlName="sourceType"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  >
                    <option value="شركة">من شركة</option>
                    <option value="شخص">من شخص (مهندس / مقاول / عميل)</option>
                    <option value="شيك">من شيك</option>
                    <option value="مستخلص">دفعة مستخلص</option>
                    <option value="أخرى">مصدر آخر</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    اسم الشركة أو الشخص أو صاحب الشيك
                  </label>
                  <input
                    type="text"
                    formControlName="sourceName"
                    placeholder="مثلاً: شركة إعمار / المهندس طارق"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    المبلغ اللي وصلني (ج.م)
                  </label>
                  <input
                    type="number"
                    formControlName="amount"
                    placeholder="50000"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm font-black text-emerald-600"
                  />
                </div>

                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    راح لحساب مشروع إيه؟
                  </label>
                  <select
                    formControlName="projectId"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  >
                    <option [ngValue]="null">الخزنة العامة / كل المشاريع</option>
                    @for (p of store.projects(); track p.id) {
                      <option [ngValue]="p.id">{{ p.name }}</option>
                    }
                  </select>
                </div>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    طريقة الاستلام
                  </label>
                  <select
                    formControlName="method"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  >
                    <option value="نقدي">نقدي (كاش)</option>
                    <option value="شيك">شيك</option>
                    <option value="تحويل بنكي">تحويل بنكي</option>
                    <option value="محفظة إلكترونية">محفظة / إنستاباي</option>
                  </select>
                </div>

                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    التاريخ
                  </label>
                  <input
                    type="date"
                    formControlName="date"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  />
                </div>

                <div>
                  <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الشيك / المرجع (اختياري)
                  </label>
                  <input
                    type="text"
                    formControlName="checkNumber"
                    placeholder="اختياري"
                    class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                  />
                </div>
              </div>

              <div>
                <label class="block text-xs font-extrabold text-slate-700 dark:text-slate-300 mb-1">
                  ملاحظات وتفاصيل إضافية
                </label>
                <input
                  type="text"
                  formControlName="notes"
                  placeholder="مثلاً: دفعة تحت الحساب من مستخلص أكتوبر..."
                  class="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-xs font-bold"
                />
              </div>

              <div class="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  (click)="closePaymentModal()"
                  class="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  [disabled]="paymentForm.invalid"
                  class="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
                >
                  <mat-icon class="!w-4 !h-4 !text-[18px]">check_circle</mat-icon>
                  <span>حفظ الدفعة في الخزنة والمشروع</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      }
    </div>
  `,
})
export class MyLedger {
  readonly store = inject(StoreService);
  private readonly fb = inject(FormBuilder);

  readonly activeTab = signal<'projects' | 'check-withdrawals' | 'incoming' | 'movements' | 'methodology'>('projects');
  readonly movementFilter = signal<'all' | 'in' | 'out'>('all');
  readonly showPaymentModal = signal<boolean>(false);
  readonly editingPaymentId = signal<number | null>(null);
  readonly headerMoreOpen = signal<boolean>(false);
  readonly openProjectMenuName = signal<string | null>(null);

  openProjectCheckWithdrawals(projectId: number | null): void {
    this.store.pocketSelectedProjectId.set(projectId);
    this.store.pocketSelectedCheckId.set(null);
    this.activeTab.set('check-withdrawals');
  }

  onSelectCheckForWithdrawal(checkId: number | null): void {
    this.store.pocketSelectedCheckId.set(checkId);
    if (checkId) {
      const chk = this.store.checks().find((c) => c.id === checkId);
      if (chk) {
        this.store.pocketSelectedProjectId.set(chk.projectId);
        this.store.pocketWithdrawnAmount.set(chk.withdrawnAmount ?? chk.amount);
        this.store.pocketWithdrawalFee.set(chk.withdrawalFee ?? 0);
      }
    }
  }

  openMovementQuickSheet(mv: {
    workerId?: number | null;
    checkId?: number | null;
    projectId?: number | null;
  }): void {
    if (mv.workerId) {
      this.store.openWorkerSheet(mv.workerId);
    } else if (mv.checkId) {
      this.store.openCheckSheet(mv.checkId);
    } else {
      this.store.openProjectSheet(mv.projectId ?? null);
    }
  }

  // Interactive Project Profit Simulator signals
  readonly simContractValue = signal<number>(150000);
  readonly simWorkersCount = signal<number>(6);
  readonly simDailyWage = signal<number>(500);
  readonly simDaysCount = signal<number>(20);
  readonly simMaterialsCost = signal<number>(35000);

  readonly simResult = computed(() => {
    const contract = Math.max(0, Number(this.simContractValue()) || 0);
    const workers = Math.max(0, Number(this.simWorkersCount()) || 0);
    const wage = Math.max(0, Number(this.simDailyWage()) || 0);
    const days = Math.max(0, Number(this.simDaysCount()) || 0);
    const materials = Math.max(0, Number(this.simMaterialsCost()) || 0);

    const totalWorkDays = workers * days;
    const laborCost = totalWorkDays * wage;
    const totalCost = laborCost + materials;
    const safetyReserve = Math.round(totalCost * 0.1);
    const netProfit = contract - totalCost;
    const marginPercent = contract > 0 ? Math.round((netProfit / contract) * 100) : 0;
    const verdict =
      marginPercent >= 25
        ? 'ربح ممتاز'
        : marginPercent >= 12
          ? 'ربح آمن'
          : marginPercent > 0
            ? 'هامش ضعيف'
            : 'خسارة - ارفع السعر';

    return {
      totalWorkDays,
      laborCost,
      totalCost,
      safetyReserve,
      netProfit,
      marginPercent,
      verdict,
    };
  });

  readonly paymentForm = this.fb.group({
    sourceType: ['شركة' as PaymentSourceType, Validators.required],
    sourceName: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(1)]],
    projectId: [null as number | null],
    method: ['نقدي' as PaymentMethodType, Validators.required],
    date: [this.store.todayIso(), Validators.required],
    checkNumber: [''],
    notes: [''],
  });

  readonly filteredMovements = computed(() => {
    const all = this.store.comprehensiveLedger().movements;
    const f = this.movementFilter();
    if (f === 'all') return all;
    return all.filter((m) => m.direction === f);
  });

  updateSimField(
    field: 'contract' | 'workers' | 'wage' | 'days' | 'materials',
    event: Event
  ): void {
    const val = Number((event.target as HTMLInputElement).value) || 0;
    if (field === 'contract') this.simContractValue.set(val);
    if (field === 'workers') this.simWorkersCount.set(val);
    if (field === 'wage') this.simDailyWage.set(val);
    if (field === 'days') this.simDaysCount.set(val);
    if (field === 'materials') this.simMaterialsCost.set(val);
  }

  toggleProjectMenu(projectName: string): void {
    this.openProjectMenuName.update((curr) => (curr === projectName ? null : projectName));
  }

  filterMovementsByProject(_projectName: string): void {
    this.activeTab.set('movements');
    this.movementFilter.set('all');
  }

  copyFullLedgerWhatsApp(): void {
    const L = this.store.comprehensiveLedger();
    const lines = [
      '📊 *كشف الحساب الشامل للمقاول - رموز الخرسانة*',
      `• إجمالي اللي وصلني فعلياً: ${this.store.money(L.totalReceivedAll)}`,
      `• إجمالي اللي اتصرف في المشاريع: ${this.store.money(L.totalSpentAll)}`,
      `• صافي السيولة في إيدي: ${this.store.money(L.netCashInHand)}`,
      `• عليا للصنايعية والعمال: ${this.store.money(L.remainingOwedToWorkers)}`,
      `• ليا عند الشركات والشيكات: ${this.store.money(L.totalOwedToMe)}`,
      `• صافي الربح الفعلي: ${this.store.money(L.overallNetProfit)}`,
    ];
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
    }
    this.store.showToast('تم نسخ ملخص كشف الحساب الشامل للواتساب بنجاح', 'success');
  }

  copyProjectWhatsApp(proj: {
    projectName: string;
    totalReceivedForProject: number;
    advancesSpent: number;
    settlementsPaid: number;
    expensesSpent: number;
    totalSpentInProject: number;
    owedByMeInProject: number;
    netProfit: number;
  }): void {
    const lines = [
      `🏗️ *كشف حساب مشروع: ${proj.projectName}*`,
      `• وصلني للمشروع: ${this.store.money(proj.totalReceivedForProject)}`,
      `• اتصرف سلف وقبض: ${this.store.money(proj.advancesSpent + proj.settlementsPaid)}`,
      `• مصاريف موقع: ${this.store.money(proj.expensesSpent)}`,
      `• إجمالي المنصرف: ${this.store.money(proj.totalSpentInProject)}`,
      `• متبقي عليا للعمال: ${this.store.money(proj.owedByMeInProject)}`,
      `• صافي الربح الفعلي: ${this.store.money(proj.netProfit)}`,
    ];
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(lines.join('\n'));
    }
    this.store.showToast(`تم نسخ كشف حساب ${proj.projectName} للواتساب`, 'success');
  }

  printLedgerPage(): void {
    if (typeof window !== 'undefined') {
      window.print();
    }
  }

  openAddPaymentModal(preselectedProjectId?: number | null): void {
    this.editingPaymentId.set(null);
    const defaultProj =
      preselectedProjectId !== undefined ? preselectedProjectId : this.store.selectedProjectId();
    const projName = defaultProj ? this.store.projectName(defaultProj) : '';
    this.paymentForm.reset({
      sourceType: 'شركة',
      sourceName: projName,
      amount: null,
      projectId: defaultProj ?? null,
      method: 'نقدي',
      date: this.store.todayIso(),
      checkNumber: '',
      notes: '',
    });
    this.showPaymentModal.set(true);
  }

  editPayment(item: IncomingPayment): void {
    this.editingPaymentId.set(item.id ?? null);
    this.paymentForm.reset({
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      amount: item.amount,
      projectId: item.projectId,
      method: item.method,
      date: item.date,
      checkNumber: item.checkNumber || '',
      notes: item.notes || '',
    });
    this.showPaymentModal.set(true);
  }

  closePaymentModal(): void {
    this.showPaymentModal.set(false);
    this.editingPaymentId.set(null);
  }

  async submitPayment(): Promise<void> {
    if (this.paymentForm.invalid) return;
    const v = this.paymentForm.getRawValue();
    const payload: IncomingPayment = {
      id: this.editingPaymentId() ?? undefined,
      date: v.date || this.store.todayIso(),
      sourceType: (v.sourceType as PaymentSourceType) || 'شركة',
      sourceName: (v.sourceName || '').trim(),
      amount: Number(v.amount) || 0,
      method: (v.method as PaymentMethodType) || 'نقدي',
      projectId: v.projectId ?? null,
      checkNumber: (v.checkNumber || '').trim(),
      notes: (v.notes || '').trim(),
    };

    await this.store.saveIncomingPayment(payload);
    this.store.showToast(
      `تم حفظ الدفعة (${this.store.money(payload.amount)}) في حساب ${this.store.projectName(payload.projectId)}`,
      'success'
    );
    this.closePaymentModal();
  }

  async deletePayment(id: number): Promise<void> {
    await this.store.deleteIncomingPayment(id);
  }
}
