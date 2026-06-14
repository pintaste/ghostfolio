import {
  DEFAULT_PAGE_SIZE,
  TAG_ID_EXCLUDE_FROM_ANALYSIS
} from '@ghostfolio/common/config';
import { ConfirmationDialogType } from '@ghostfolio/common/enums';
import { getLocale } from '@ghostfolio/common/helper';
import {
  Activity,
  AssetProfileIdentifier
} from '@ghostfolio/common/interfaces';
import { GfSymbolPipe } from '@ghostfolio/common/pipes';
import { OrderWithAccount } from '@ghostfolio/common/types';
import { translate } from '@ghostfolio/ui/i18n';
import { NotificationService } from '@ghostfolio/ui/notifications';

import { SelectionModel } from '@angular/cdk/collections';
import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  ViewChild,
  computed,
  effect,
  inject,
  input
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import {
  MatPaginator,
  MatPaginatorModule,
  PageEvent
} from '@angular/material/paginator';
import { MatSelectModule } from '@angular/material/select';
import {
  MatSort,
  MatSortModule,
  Sort,
  SortDirection
} from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { IonIcon } from '@ionic/angular/standalone';
import { Type as ActivityType } from '@prisma/client';
import { isUUID } from 'class-validator';
import { addIcons } from 'ionicons';
import {
  alertCircleOutline,
  calendarClearOutline,
  cloudDownloadOutline,
  cloudUploadOutline,
  colorWandOutline,
  copyOutline,
  createOutline,
  documentTextOutline,
  ellipsisHorizontal,
  ellipsisVertical,
  tabletLandscapeOutline,
  trashOutline
} from 'ionicons/icons';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';
import { merge } from 'rxjs';

import { GfActivityTypeComponent } from '../activity-type/activity-type.component';
import { GfEntityLogoComponent } from '../entity-logo/entity-logo.component';
import { GfNoTransactionsInfoComponent } from '../no-transactions-info/no-transactions-info.component';
import { GfValueComponent } from '../value/value.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    GfActivityTypeComponent,
    GfEntityLogoComponent,
    GfNoTransactionsInfoComponent,
    GfSymbolPipe,
    GfValueComponent,
    IonIcon,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatMenuModule,
    MatPaginatorModule,
    MatSelectModule,
    MatSortModule,
    MatTableModule,
    MatTooltipModule,
    NgxSkeletonLoaderModule,
    ReactiveFormsModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-activities-table',
  styleUrls: ['./activities-table.component.scss'],
  templateUrl: './activities-table.component.html'
})
export class GfActivitiesTableComponent implements AfterViewInit, OnInit {
  @Input() baseCurrency: string;
  @Input() deviceType: string;
  @Input() enableClientSideFilters = false;
  @Input() hasActivities: boolean;
  @Input() hasPermissionToCreateActivity: boolean;
  @Input() hasPermissionToDeleteActivity: boolean;
  @Input() hasPermissionToExportActivities: boolean;
  @Input() hasPermissionToFilterByType: boolean;
  @Input() hasPermissionToOpenDetails = true;
  @Input() locale = getLocale();
  @Input() pageIndex: number;
  @Input() pageSize = DEFAULT_PAGE_SIZE;
  @Input() showActions = true;
  @Input() sortColumn: string;
  @Input() sortDirection: SortDirection;
  @Input() sortDisabled = false;
  @Input() totalItems = Number.MAX_SAFE_INTEGER;

  @Output() activitiesDeleted = new EventEmitter<void>();
  @Output() activityClicked = new EventEmitter<AssetProfileIdentifier>();
  @Output() activityDeleted = new EventEmitter<string>();
  @Output() activityToClone = new EventEmitter<OrderWithAccount>();
  @Output() activityToUpdate = new EventEmitter<OrderWithAccount>();
  @Output() export = new EventEmitter<void>();
  @Output() exportDrafts = new EventEmitter<string[]>();
  @Output() import = new EventEmitter<void>();
  @Output() importDividends = new EventEmitter<AssetProfileIdentifier>();
  @Output() pageChanged = new EventEmitter<PageEvent>();
  @Output() selectedActivities = new EventEmitter<Activity[]>();
  @Output() sortChanged = new EventEmitter<Sort>();
  @Output() typesFilterChanged = new EventEmitter<string[]>();

  @ViewChild(MatPaginator) paginator: MatPaginator;
  @ViewChild(MatSort) sort: MatSort;

  public activityTypesTranslationMap = new Map<ActivityType, string>();
  public hasDrafts = false;
  public hasErrors = false;
  public isUUID = isUUID;
  public selectedRows = new SelectionModel<Activity>(true, []);
  public typesFilter = new FormControl<string[]>([]);

  // Client-side filters (Activities page)
  public assetSubClassFilter = new FormControl<string[]>([]);
  public currencyFilter = new FormControl<string[]>([]);
  public searchControl = new FormControl<string>('');

  public readonly dataSource = input.required<
    MatTableDataSource<Activity> | undefined
  >();
  public readonly showAccountColumn = input(true);
  public readonly showCheckbox = input(false);
  public readonly showNameColumn = input(true);

  // Distinct asset sub classes present in the data (for the filter dropdown)
  public readonly availableAssetSubClasses = computed(() => {
    const values = new Set<string>();

    for (const activity of this.dataSource()?.data ?? []) {
      if (activity.SymbolProfile?.assetSubClass) {
        values.add(activity.SymbolProfile.assetSubClass);
      }
    }

    return [...values].sort();
  });

  // Distinct activity currencies present in the data (for the filter dropdown)
  public readonly availableCurrencies = computed(() => {
    const values = new Set<string>();

    for (const activity of this.dataSource()?.data ?? []) {
      const currency = activity.currency ?? activity.SymbolProfile?.currency;

      if (currency) {
        values.add(currency);
      }
    }

    return [...values].sort();
  });

  protected readonly displayedColumns = computed(() => {
    let columns = [
      'select',
      'importStatus',
      'icon',
      'nameWithSymbol',
      'type',
      'date',
      'quantity',
      'unitPrice',
      'fee',
      'value',
      'currency',
      'valueInBaseCurrency',
      'account',
      'comment',
      'actions'
    ];

    if (!this.showAccountColumn()) {
      columns = columns.filter((column) => {
        return column !== 'account';
      });
    }

    if (!this.showCheckbox()) {
      columns = columns.filter((column) => {
        return column !== 'importStatus' && column !== 'select';
      });
    }

    if (!this.showNameColumn()) {
      columns = columns.filter((column) => {
        return column !== 'nameWithSymbol';
      });
    }

    return columns;
  });

  protected readonly isLoading = computed(() => {
    return !this.dataSource();
  });

  private readonly notificationService = inject(NotificationService);

  public constructor(private destroyRef: DestroyRef) {
    for (const type of Object.keys(ActivityType) as ActivityType[]) {
      this.activityTypesTranslationMap.set(
        ActivityType[type],
        translate(ActivityType[type])
      );
    }

    addIcons({
      alertCircleOutline,
      calendarClearOutline,
      cloudDownloadOutline,
      cloudUploadOutline,
      colorWandOutline,
      copyOutline,
      createOutline,
      documentTextOutline,
      ellipsisHorizontal,
      ellipsisVertical,
      tabletLandscapeOutline,
      trashOutline
    });

    // When client-side filtering is enabled, attach the composite filter
    // predicate and client-side sort/paginator to each (re)created dataSource
    effect(() => {
      const dataSource = this.dataSource();

      if (dataSource && this.enableClientSideFilters) {
        dataSource.filterPredicate = this.clientSideFilterPredicate;

        if (this.paginator) {
          dataSource.paginator = this.paginator;
        }

        if (this.sort) {
          dataSource.sort = this.sort;
        }

        this.applyClientSideFilter();
      }
    });
  }

  public ngOnInit() {
    if (this.enableClientSideFilters) {
      merge(
        this.assetSubClassFilter.valueChanges,
        this.currencyFilter.valueChanges,
        this.searchControl.valueChanges,
        this.typesFilter.valueChanges
      )
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe(() => {
          this.applyClientSideFilter();
        });
    }

    if (this.showCheckbox()) {
      this.toggleAllRows();
      this.selectedRows.changed
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((selectedRows) => {
          this.selectedActivities.emit(selectedRows.source.selected);
        });
    }

    if (!this.enableClientSideFilters) {
      this.typesFilter.valueChanges
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe((types) => {
          this.typesFilterChanged.emit(types ?? []);
        });
    }
  }

  // Composite client-side filter: free-text search + type + asset sub class +
  // currency. Reads the form controls directly; the filter string only triggers
  // re-evaluation.
  private clientSideFilterPredicate = (activity: Activity): boolean => {
    const search = (this.searchControl.value ?? '').trim().toLowerCase();
    const types = this.typesFilter.value ?? [];
    const assetSubClasses = this.assetSubClassFilter.value ?? [];
    const currencies = this.currencyFilter.value ?? [];

    if (search) {
      const haystack = [
        activity.SymbolProfile?.symbol,
        activity.SymbolProfile?.name,
        activity.comment
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      if (!haystack.includes(search)) {
        return false;
      }
    }

    if (types.length && !types.includes(activity.type)) {
      return false;
    }

    if (assetSubClasses.length) {
      const assetSubClass = activity.SymbolProfile?.assetSubClass ?? '';

      if (!assetSubClasses.includes(assetSubClass)) {
        return false;
      }
    }

    if (currencies.length) {
      const currency =
        activity.currency ?? activity.SymbolProfile?.currency ?? '';

      if (!currencies.includes(currency)) {
        return false;
      }
    }

    return true;
  };

  protected applyClientSideFilter() {
    const dataSource = this.dataSource();

    if (!dataSource) {
      return;
    }

    const hasActiveFilter =
      !!(this.searchControl.value ?? '').trim() ||
      (this.typesFilter.value ?? []).length > 0 ||
      (this.assetSubClassFilter.value ?? []).length > 0 ||
      (this.currencyFilter.value ?? []).length > 0;

    // MatTableDataSource only runs filterPredicate when filter is truthy
    dataSource.filter = hasActiveFilter ? Date.now().toString() : '';

    if (dataSource.paginator) {
      dataSource.paginator.firstPage();
    }
  }

  protected onResetClientSideFilters() {
    this.searchControl.setValue('');
    this.typesFilter.setValue([]);
    this.assetSubClassFilter.setValue([]);
    this.currencyFilter.setValue([]);
  }

  public ngAfterViewInit() {
    const dataSource = this.dataSource();

    if (dataSource) {
      dataSource.paginator = this.paginator;
    }

    this.sort.sortChange.subscribe((value: Sort) => {
      this.sortChanged.emit(value);
    });
  }

  public areAllRowsSelected() {
    const numSelectedRows = this.selectedRows.selected.length;
    const numTotalRows = this.dataSource()?.data.length;
    return numSelectedRows === numTotalRows;
  }

  public canClickActivity(activity: Activity) {
    return (
      this.hasPermissionToOpenDetails &&
      this.isExcludedFromAnalysis(activity) === false &&
      activity.isDraft === false &&
      ['BUY', 'DIVIDEND', 'SELL'].includes(activity.type)
    );
  }

  public isExcludedFromAnalysis(activity: Activity) {
    return (
      activity.account?.isExcluded ??
      activity.tags?.some(({ id }) => {
        return id === TAG_ID_EXCLUDE_FROM_ANALYSIS;
      })
    );
  }

  public onChangePage(page: PageEvent) {
    this.pageChanged.emit(page);
  }

  public onClickActivity(activity: Activity) {
    if (this.showCheckbox()) {
      if (!activity.error) {
        this.selectedRows.toggle(activity);
      }
    } else if (this.canClickActivity(activity)) {
      this.activityClicked.emit({
        dataSource: activity.SymbolProfile.dataSource,
        symbol: activity.SymbolProfile.symbol
      });
    }
  }

  public onCloneActivity(aActivity: OrderWithAccount) {
    this.activityToClone.emit(aActivity);
  }

  public onDeleteActivities() {
    this.notificationService.confirm({
      confirmFn: () => {
        this.activitiesDeleted.emit();
      },
      confirmType: ConfirmationDialogType.Warn,
      title: $localize`Do you really want to delete these activities?`
    });
  }

  public onDeleteActivity(aId: string) {
    this.notificationService.confirm({
      confirmFn: () => {
        this.activityDeleted.emit(aId);
      },
      confirmType: ConfirmationDialogType.Warn,
      title: $localize`Do you really want to delete this activity?`
    });
  }

  public onExport() {
    this.export.emit();
  }

  public onExportDraft(aActivityId: string) {
    this.exportDrafts.emit([aActivityId]);
  }

  public onExportDrafts() {
    this.exportDrafts.emit(
      this.dataSource()
        ?.filteredData.filter((activity) => {
          return activity.isDraft;
        })
        .map((activity) => {
          return activity.id;
        })
    );
  }

  public onImport() {
    this.import.emit();
  }

  public onImportDividends() {
    this.importDividends.emit();
  }

  public onOpenComment(aComment: string) {
    this.notificationService.alert({
      title: aComment
    });
  }

  public onUpdateActivity(aActivity: OrderWithAccount) {
    this.activityToUpdate.emit(aActivity);
  }

  public sortByValue(
    a: { key: ActivityType; value: string },
    b: { key: ActivityType; value: string }
  ) {
    return a.value.localeCompare(b.value);
  }

  public toggleAllRows() {
    if (this.areAllRowsSelected()) {
      this.selectedRows.clear();
    } else {
      this.dataSource()?.data.forEach((row) => {
        this.selectedRows.select(row);
      });
    }

    this.selectedActivities.emit(this.selectedRows.selected);
  }
}
