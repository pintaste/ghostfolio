import { getLocale, getLowercase } from '@ghostfolio/common/helper';
import {
  AssetProfileIdentifier,
  PortfolioPosition
} from '@ghostfolio/common/interfaces';

import {
  CUSTOM_ELEMENTS_SCHEMA,
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  model,
  output,
  signal,
  viewChild
} from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatSort, MatSortModule, Sort } from '@angular/material/sort';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { IonIcon } from '@ionic/angular/standalone';
import { AssetSubClass } from '@prisma/client';
import { addIcons } from 'ionicons';
import { chevronDownOutline, chevronForwardOutline } from 'ionicons/icons';
import { NgxSkeletonLoaderModule } from 'ngx-skeleton-loader';

import { GfEntityLogoComponent } from '../entity-logo/entity-logo.component';
import { GfValueComponent } from '../value/value.component';

export interface HoldingsGroupRow {
  allocationInPercentage: number;
  count: number;
  isGroupHeader: true;
  label: string;
  netPerformancePercentWithCurrencyEffect: number;
  netPerformanceWithCurrencyEffect: number;
  valueInBaseCurrency: number;
}

export interface HoldingsTotals {
  allocationInPercentage: number;
  netPerformancePercentWithCurrencyEffect: number;
  netPerformanceWithCurrencyEffect: number;
  valueInBaseCurrency: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    GfEntityLogoComponent,
    GfValueComponent,
    IonIcon,
    MatButtonModule,
    MatDialogModule,
    MatPaginatorModule,
    MatSortModule,
    MatTableModule,
    NgxSkeletonLoaderModule
  ],
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  selector: 'gf-holdings-table',
  styleUrls: ['./holdings-table.component.scss'],
  templateUrl: './holdings-table.component.html'
})
export class GfHoldingsTableComponent {
  public readonly hasPermissionToOpenDetails = input(true);
  public readonly hasPermissionToShowQuantities = input(true);
  public readonly hasPermissionToShowValues = input(true);
  public readonly holdings = input.required<PortfolioPosition[]>();
  public readonly groupByAssetSubClass = input(false);
  public readonly stickyHeader = input(false);
  public readonly showTotal = input(false);
  public readonly locale = input(getLocale());
  public readonly pageSize = model(Number.MAX_SAFE_INTEGER);

  public readonly holdingClicked = output<AssetProfileIdentifier>();

  protected readonly paginator = viewChild.required(MatPaginator);
  protected readonly sort = viewChild.required(MatSort);

  protected readonly dataSource = new MatTableDataSource<PortfolioPosition>([]);

  protected readonly displayedColumns = computed(() => {
    const columns = ['icon', 'nameWithSymbol', 'dateOfFirstActivity'];

    if (this.hasPermissionToShowQuantities()) {
      columns.push('quantity');
    }

    if (this.hasPermissionToShowValues()) {
      columns.push('valueInBaseCurrency');
    }

    columns.push('allocationInPercentage');

    if (this.hasPermissionToShowValues()) {
      columns.push('performance');
    }

    columns.push('performanceInPercentage');
    return columns;
  });

  protected readonly ignoreAssetSubClasses: AssetSubClass[] = [
    AssetSubClass.CASH
  ];

  protected readonly isLoading = computed(() => !this.holdings());

  // Grand totals for the footer "Total" row
  protected readonly totals = computed<HoldingsTotals>(() => {
    const holdings = this.holdings() ?? [];

    const valueInBaseCurrency = holdings.reduce(
      (sum, { valueInBaseCurrency }) => sum + (valueInBaseCurrency ?? 0),
      0
    );
    const netPerformanceWithCurrencyEffect = holdings.reduce(
      (sum, { netPerformanceWithCurrencyEffect }) =>
        sum + (netPerformanceWithCurrencyEffect ?? 0),
      0
    );
    const investment = holdings.reduce(
      (sum, { investment }) => sum + (investment ?? 0),
      0
    );
    const allocationInPercentage = holdings.reduce(
      (sum, { allocationInPercentage }) => sum + (allocationInPercentage ?? 0),
      0
    );

    return {
      allocationInPercentage,
      netPerformancePercentWithCurrencyEffect:
        Math.abs(investment) > 0.01
          ? netPerformanceWithCurrencyEffect / investment
          : 0,
      netPerformanceWithCurrencyEffect,
      valueInBaseCurrency
    };
  });

  // Labels of collapsed category groups (members hidden, header still shown)
  protected readonly collapsedGroups = signal<Set<string>>(new Set());

  // Active sort while grouping (drives in-group ordering; default mirrors the
  // table's matSortActive/Direction)
  private readonly sortState = signal<Sort>({
    active: 'allocationInPercentage',
    direction: 'desc'
  });

  public constructor() {
    addIcons({ chevronDownOutline, chevronForwardOutline });

    this.dataSource.sortingDataAccessor = getLowercase;

    // Reactive data update
    effect(() => {
      const holdings = this.holdings();
      const sort = this.sortState();

      this.dataSource.data = this.groupByAssetSubClass()
        ? this.buildGroupedRows(holdings ?? [], sort)
        : (holdings ?? []);
    });

    // Reactive view connection
    effect((onCleanup) => {
      this.dataSource.paginator = this.paginator();

      const sort = this.sort();

      if (this.groupByAssetSubClass()) {
        // Let MatTableDataSource keep the grouped order untouched; capture sort
        // clicks ourselves and re-order members within each group instead
        this.dataSource.sort = null;

        const subscription = sort.sortChange.subscribe((nextSort: Sort) => {
          this.sortState.set(nextSort);
        });

        onCleanup(() => subscription.unsubscribe());
      } else {
        this.dataSource.sort = sort;
      }
    });
  }

  protected isGroupHeader = (
    _index: number,
    row: PortfolioPosition
  ): boolean => {
    return (row as unknown as HoldingsGroupRow).isGroupHeader === true;
  };

  protected isHoldingRow = (
    _index: number,
    row: PortfolioPosition
  ): boolean => {
    return !(row as unknown as HoldingsGroupRow).isGroupHeader;
  };

  // Resolves a (possibly dotted, e.g. "assetProfile.name") sort path
  private getSortValue(item: PortfolioPosition, path: string): any {
    return path
      ?.split('.')
      .reduce((value: any, key) => value?.[key], item as any);
  }

  // Group holdings by asset sub class; each group is preceded by a header row
  // carrying the group label and subtotals (value + allocation). Members are
  // ordered by the active sort so column-header sorting keeps working.
  private buildGroupedRows(
    holdings: PortfolioPosition[],
    sort: Sort
  ): PortfolioPosition[] {
    const groups = new Map<string, PortfolioPosition[]>();

    for (const holding of holdings) {
      const label =
        holding.assetProfile?.assetSubClassLabel ??
        holding.assetProfile?.assetSubClass ??
        'Other';

      let bucket = groups.get(label);

      if (!bucket) {
        bucket = [];
        groups.set(label, bucket);
      }

      bucket.push(holding);
    }

    const direction = sort?.direction === 'asc' ? 1 : -1;
    const sortColumn = sort?.direction ? sort.active : 'allocationInPercentage';

    const compareMembers = (a: PortfolioPosition, b: PortfolioPosition) => {
      const valueA = this.getSortValue(a, sortColumn);
      const valueB = this.getSortValue(b, sortColumn);

      if (valueA === valueB) {
        return 0;
      }
      if (valueA === undefined || valueA === null) {
        return 1;
      }
      if (valueB === undefined || valueB === null) {
        return -1;
      }

      const normalizedA =
        typeof valueA === 'string' ? valueA.toLowerCase() : valueA;
      const normalizedB =
        typeof valueB === 'string' ? valueB.toLowerCase() : valueB;

      return (normalizedA < normalizedB ? -1 : 1) * direction;
    };

    const orderedGroups = [...groups.entries()]
      .map(([label, members]) => {
        const sortedMembers = [...members].sort(compareMembers);

        return {
          label,
          members: sortedMembers,
          valueInBaseCurrency: members.reduce(
            (sum, { valueInBaseCurrency }) => sum + (valueInBaseCurrency ?? 0),
            0
          ),
          allocationInPercentage: members.reduce(
            (sum, { allocationInPercentage }) =>
              sum + (allocationInPercentage ?? 0),
            0
          ),
          netPerformanceWithCurrencyEffect: members.reduce(
            (sum, { netPerformanceWithCurrencyEffect }) =>
              sum + (netPerformanceWithCurrencyEffect ?? 0),
            0
          ),
          investment: members.reduce(
            (sum, { investment }) => sum + (investment ?? 0),
            0
          )
        };
      })
      .sort((a, b) => b.valueInBaseCurrency - a.valueInBaseCurrency);

    const rows: PortfolioPosition[] = [];

    for (const group of orderedGroups) {
      const header: HoldingsGroupRow = {
        allocationInPercentage: group.allocationInPercentage,
        count: group.members.length,
        isGroupHeader: true,
        label: group.label,
        netPerformancePercentWithCurrencyEffect:
          Math.abs(group.investment) > 0.01
            ? group.netPerformanceWithCurrencyEffect / group.investment
            : 0,
        netPerformanceWithCurrencyEffect:
          group.netPerformanceWithCurrencyEffect,
        valueInBaseCurrency: group.valueInBaseCurrency
      };

      rows.push(header as unknown as PortfolioPosition);

      if (!this.collapsedGroups().has(group.label)) {
        rows.push(...group.members);
      }
    }

    return rows;
  }

  protected onToggleGroup(row: PortfolioPosition) {
    const label = (row as unknown as HoldingsGroupRow).label;
    const collapsed = new Set(this.collapsedGroups());

    if (collapsed.has(label)) {
      collapsed.delete(label);
    } else {
      collapsed.add(label);
    }

    this.collapsedGroups.set(collapsed);
  }

  protected isGroupCollapsed(row: PortfolioPosition): boolean {
    return this.collapsedGroups().has(
      (row as unknown as HoldingsGroupRow).label
    );
  }

  protected canShowDetails(holding: PortfolioPosition): boolean {
    return (
      this.hasPermissionToOpenDetails() &&
      !this.ignoreAssetSubClasses.includes(holding.assetProfile.assetSubClass)
    );
  }

  protected onOpenHoldingDialog({
    dataSource,
    symbol
  }: AssetProfileIdentifier) {
    this.holdingClicked.emit({ dataSource, symbol });
  }

  protected onShowAllHoldings() {
    this.pageSize.set(Number.MAX_SAFE_INTEGER);

    setTimeout(() => {
      this.dataSource.paginator = this.paginator();
    });
  }
}
