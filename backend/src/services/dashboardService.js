import { kingdeeService } from "./kingdeeService.js";
import {
  getAuthorizedDashboardScope,
} from "../auth/dashboardAuthorization.js";

const AREA_LEVELS = [
  "district",
  "region",
  "subRegion",
  "store",
  "promoter",
];

function normalizeText(value) {
  return String(
    value ?? ""
  ).trim();
}

function normalizeKey(value) {
  return normalizeText(
    value
  ).toUpperCase();
}

function todayLocal() {
  const now =
    new Date();

  const year =
    now.getFullYear();

  const month =
    String(
      now.getMonth() + 1
    ).padStart(2, "0");

  const day =
    String(
      now.getDate()
    ).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getSelectedDays(
  fromDate,
  toDate
) {
  const from =
    new Date(
      `${fromDate}T00:00:00`
    );

  const to =
    new Date(
      `${toDate}T00:00:00`
    );

  if (
    Number.isNaN(
      from.getTime()
    ) ||
    Number.isNaN(
      to.getTime()
    )
  ) {
    return 1;
  }

  return Math.max(
    1,
    Math.floor(
      (
        to.getTime() -
        from.getTime()
      ) /
      86400000
    ) + 1
  );
}

function numberValue(value) {
  const parsed =
    Number(value);

  return Number.isFinite(
    parsed
  )
    ? parsed
    : 0;
}

function sumBy(
  rows,
  key
) {
  return (
    rows || []
  ).reduce(
    (
      total,
      row
    ) =>
      total +
      numberValue(
        row?.[key]
      ),
    0
  );
}

function getDisplayModel(row) {
  return normalizeText(
    row?.displayModel ||
    row?.model ||
    row?.materialName ||
    row?.materialCode ||
    "Unknown Model"
  );
}

function getDisplayColor(row) {
  return normalizeText(
    row?.displayColor ||
    row?.color ||
    "No Color"
  );
}

function matchesScope(
  row,
  scope
) {
  if (scope?.allAreas === true) {
    return true;
  }

  if (
    scope.district &&
    normalizeKey(
      row?.district
    ) !==
      normalizeKey(
        scope.district
      )
  ) {
    return false;
  }

  if (
    scope.region &&
    normalizeKey(
      row?.region
    ) !==
      normalizeKey(
        scope.region
      )
  ) {
    return false;
  }

  if (
    scope.subRegion &&
    normalizeKey(
      row?.subRegion
    ) !==
      normalizeKey(
        scope.subRegion
      )
  ) {
    return false;
  }

  if (
    scope.warehouseCode &&
    normalizeKey(
      row?.warehouseCode
    ) !==
      normalizeKey(
        scope.warehouseCode
      )
  ) {
    return false;
  }

  if (
    scope.salesNo &&
    normalizeKey(
      row?.salesNo
    ) !==
      normalizeKey(
        scope.salesNo
      )
  ) {
    return false;
  }

  return true;
}

function filterRowsByScope(
  rows,
  scope
) {
  return (
    rows || []
  ).filter(
    (row) =>
      matchesScope(
        row,
        scope
      )
  );
}

/*
 * Inventory visibility rule: inventory records whose District is HQ
 * must never be exposed. Apply before scope filtering/aggregation.
 */
function excludeHQInventoryRows(rows) {
  return (rows || []).filter(
    (row) => normalizeKey(row?.district) !== "HQ"
  );
}

function buildAreaIdentity(
  row,
  level
) {
  switch (level) {
    case "district":
      return {
        key:
          normalizeText(
            row?.district
          ),
        name:
          normalizeText(
            row?.district
          ),
      };

    case "region":
      return {
        key:
          normalizeText(
            row?.region
          ),
        name:
          normalizeText(
            row?.region
          ),
      };

    case "subRegion":
      return {
        key:
          normalizeText(
            row?.subRegion
          ),
        name:
          normalizeText(
            row?.subRegion
          ),
      };

    case "store":
      return {
        key:
          normalizeText(
            row?.warehouseCode
          ),
        name:
          normalizeText(
            row?.warehouse ||
            row?.warehouseCode
          ),
        warehouseCode:
          normalizeText(
            row?.warehouseCode
          ),
      };

    case "promoter":
      return {
        key:
          normalizeText(
            row?.salesNo ||
            row?.sales
          ),
        name:
          normalizeText(
            row?.sales ||
            row?.salesNo
          ),
        salesNo:
          normalizeText(
            row?.salesNo
          ),
        role:
          normalizeText(
            row?.role
          ),
      };

    default:
      return {
        key: "",
        name: "",
      };
  }
}

function aggregateAreaRows({
  inventoryRows,
  sellOutRows,
  level,
}) {
  const groups =
    new Map();

  const ensureGroup = (
    identity
  ) => {
    const groupKey =
      normalizeKey(
        identity.key
      );

    if (!groupKey) {
      return null;
    }

    if (
      !groups.has(
        groupKey
      )
    ) {
      groups.set(
        groupKey,
        {
          level,
          key:
            identity.key,
          name:
            identity.name ||
            identity.key,
          warehouseCode:
            identity
              .warehouseCode ||
            "",
          salesNo:
            identity.salesNo ||
            "",
          role:
            identity.role ||
            "",
          sellOutQty: 0,
          salesAmount: 0,
          inventoryQty:
            level ===
            "promoter"
              ? null
              : 0,
          hasChildren:
            level !==
            "promoter",
        }
      );
    }

    return groups.get(
      groupKey
    );
  };

  if (
    level !==
    "promoter"
  ) {
    for (
      const row of
      inventoryRows || []
    ) {
      const identity =
        buildAreaIdentity(
          row,
          level
        );

      const group =
        ensureGroup(
          identity
        );

      if (!group) {
        continue;
      }

      group.inventoryQty +=
        numberValue(
          row.inventoryQty
        );
    }
  }

  for (
    const row of
    sellOutRows || []
  ) {
    const identity =
      buildAreaIdentity(
        row,
        level
      );

    const group =
      ensureGroup(
        identity
      );

    if (!group) {
      continue;
    }

    group.sellOutQty +=
      numberValue(
        row.sellOutQty
      );

    group.salesAmount +=
      numberValue(
        row.salesAmount
      );
  }

  return [
    ...groups.values(),
  ].sort(
    (a, b) =>
      b.sellOutQty -
        a.sellOutQty ||
      b.salesAmount -
        a.salesAmount ||
      String(
        a.name
      ).localeCompare(
        String(
          b.name
        )
      )
  );
}

function aggregateModels({
  inventoryRows,
  sellOutRows,
  includeInventory = true,
  hideZeroActivity = false,
}) {
  const models =
    new Map();

  const ensureModel = (
    row
  ) => {
    const modelName =
      getDisplayModel(
        row
      );

    const modelKey =
      normalizeKey(
        modelName
      );

    if (
      !models.has(
        modelKey
      )
    ) {
      models.set(
        modelKey,
        {
          key:
            modelName,
          model:
            modelName,
          sellOutQty: 0,
          salesAmount: 0,
          inventoryQty: 0,
          colors:
            new Map(),
        }
      );
    }

    return models.get(
      modelKey
    );
  };

  const ensureColor = (
    model,
    row
  ) => {
    const colorName =
      getDisplayColor(
        row
      );

    const colorKey =
      normalizeKey(
        colorName
      );

    if (
      !model.colors.has(
        colorKey
      )
    ) {
      model.colors.set(
        colorKey,
        {
          key:
            colorName,
          color:
            colorName,
          sellOutQty: 0,
          salesAmount: 0,
          inventoryQty: 0,
        }
      );
    }

    return model.colors.get(
      colorKey
    );
  };

  if (includeInventory) {
    for (
      const row of
      inventoryRows || []
    ) {
      const model =
        ensureModel(
          row
        );

      const color =
        ensureColor(
          model,
          row
        );

      const qty =
        numberValue(
          row.inventoryQty
        );

      model.inventoryQty +=
        qty;

      color.inventoryQty +=
        qty;
    }
  }

  for (
    const row of
    sellOutRows || []
  ) {
    const model =
      ensureModel(
        row
      );

    const color =
      ensureColor(
        model,
        row
      );

    const qty =
      numberValue(
        row.sellOutQty
      );

    const amount =
      numberValue(
        row.salesAmount
      );

    model.sellOutQty +=
      qty;

    model.salesAmount +=
      amount;

    color.sellOutQty +=
      qty;

    color.salesAmount +=
      amount;
  }

  let result = [
    ...models.values(),
  ]
    .map(
      (model) => {
        let colors = [
          ...model.colors.values(),
        ];

        if (hideZeroActivity) {
          colors =
            colors.filter(
              (color) =>
                numberValue(
                  color.sellOutQty
                ) > 0 ||
                numberValue(
                  color.salesAmount
                ) > 0
            );
        }

        colors =
          colors
            .map(
              (color) => ({
                ...color,
                inventoryQty:
                  includeInventory
                    ? color.inventoryQty
                    : null,
              })
            )
            .sort(
              (a, b) =>
                b.sellOutQty -
                  a.sellOutQty ||
                b.salesAmount -
                  a.salesAmount ||
                String(
                  a.color
                ).localeCompare(
                  String(
                    b.color
                  )
                )
            );

        return {
          key:
            model.key,
          model:
            model.model,
          sellOutQty:
            model.sellOutQty,
          salesAmount:
            model.salesAmount,
          inventoryQty:
            includeInventory
              ? model.inventoryQty
              : null,
          hasChildren:
            colors.length > 0,
          colors,
        };
      }
    );

  if (hideZeroActivity) {
    result =
      result.filter(
        (model) =>
          numberValue(
            model.sellOutQty
          ) > 0 ||
          numberValue(
            model.salesAmount
          ) > 0
      );
  }

  return result.sort(
    (a, b) =>
      b.sellOutQty -
        a.sellOutQty ||
      b.salesAmount -
        a.salesAmount ||
      String(
        a.model
      ).localeCompare(
        String(
          b.model
        )
      )
  );
}

function getNextLevel(
  currentLevel
) {
  const index =
    AREA_LEVELS.indexOf(
      currentLevel
    );

  if (
    index < 0 ||
    index >=
      AREA_LEVELS.length -
        1
  ) {
    return null;
  }

  return AREA_LEVELS[
    index + 1
  ];
}

function buildBreadcrumbs(
  scope
) {
  const items = [];

  if (scope.district) {
    items.push({
      level:
        "district",
      key:
        scope.district,
      name:
        scope.district,
    });
  }

  if (scope.region) {
    items.push({
      level:
        "region",
      key:
        scope.region,
      name:
        scope.region,
    });
  }

  if (scope.subRegion) {
    items.push({
      level:
        "subRegion",
      key:
        scope.subRegion,
      name:
        scope.subRegion,
    });
  }

  if (
    scope.warehouseCode
  ) {
    items.push({
      level:
        "store",
      key:
        scope.warehouseCode,
      name:
        scope.warehouseName ||
        scope.warehouseCode,
    });
  }

  if (scope.salesNo) {
    items.push({
      level:
        "promoter",
      key:
        scope.salesNo,
      name:
        scope.salesName ||
        scope.salesNo,
    });
  }

  return items;
}


function normalizeSearchText(value) {
  return normalizeText(value)
    .normalize("NFD")
    .replace(
      /[\u0300-\u036f]/g,
      ""
    )
    .toLowerCase()
    .replace(
      /[^a-z0-9]+/g,
      " "
    )
    .trim();
}

function bigrams(value) {
  const text =
    normalizeSearchText(
      value
    ).replace(/\s+/g, "");

  if (text.length < 2) {
    return text
      ? [text]
      : [];
  }

  const result = [];

  for (
    let index = 0;
    index <
      text.length - 1;
    index += 1
  ) {
    result.push(
      text.slice(
        index,
        index + 2
      )
    );
  }

  return result;
}

function diceCoefficient(
  left,
  right
) {
  const leftParts =
    bigrams(left);

  const rightParts =
    bigrams(right);

  if (
    leftParts.length === 0 ||
    rightParts.length === 0
  ) {
    return 0;
  }

  const counts =
    new Map();

  for (
    const part of
    leftParts
  ) {
    counts.set(
      part,
      (
        counts.get(part) ||
        0
      ) + 1
    );
  }

  let matches = 0;

  for (
    const part of
    rightParts
  ) {
    const count =
      counts.get(part) ||
      0;

    if (count > 0) {
      matches += 1;

      counts.set(
        part,
        count - 1
      );
    }
  }

  return (
    2 * matches
  ) /
    (
      leftParts.length +
      rightParts.length
    );
}

function fuzzyScore(
  query,
  value
) {
  const normalizedQuery =
    normalizeSearchText(
      query
    );

  const normalizedValue =
    normalizeSearchText(
      value
    );

  if (
    !normalizedQuery ||
    !normalizedValue
  ) {
    return 0;
  }

  if (
    normalizedValue ===
    normalizedQuery
  ) {
    return 100;
  }

  if (
    normalizedValue.startsWith(
      normalizedQuery
    )
  ) {
    return 96;
  }

  if (
    normalizedValue.includes(
      normalizedQuery
    )
  ) {
    return 91;
  }

  const queryTokens =
    normalizedQuery
      .split(/\s+/)
      .filter(Boolean);

  const valueTokens =
    normalizedValue
      .split(/\s+/)
      .filter(Boolean);

  const matchedTokens =
    queryTokens.filter(
      (token) =>
        valueTokens.some(
          (valueToken) =>
            valueToken.includes(
              token
            ) ||
            token.includes(
              valueToken
            )
        )
    ).length;

  if (
    queryTokens.length > 0 &&
    matchedTokens ===
      queryTokens.length
  ) {
    return 86;
  }

  const dice =
    diceCoefficient(
      normalizedQuery,
      normalizedValue
    );

  return Math.round(
    dice * 80
  );
}

function deepestAreaLevel(
  row
) {
  if (
    normalizeText(
      row?.warehouseCode
    )
  ) {
    return "store";
  }

  if (
    normalizeText(
      row?.subRegion
    )
  ) {
    return "subRegion";
  }

  if (
    normalizeText(
      row?.region
    )
  ) {
    return "region";
  }

  return "district";
}

function navigationScopeFromRow(
  row,
  {
    includeSalesNo = false,
  } = {}
) {
  return {
    district:
      normalizeText(
        row?.district
      ),
    region:
      normalizeText(
        row?.region
      ),
    subRegion:
      normalizeText(
        row?.subRegion
      ),
    warehouseCode:
      normalizeText(
        row?.warehouseCode
      ),
    salesNo:
      includeSalesNo
        ? normalizeText(
            row?.salesNo
          )
        : "",
  };
}

function addSearchCandidate(
  map,
  candidate
) {
  const label =
    normalizeText(
      candidate.label
    );

  if (!label) {
    return;
  }

  const navigationScope =
    candidate.navigation
      ?.scope || {};

  const identity = [
    candidate.type,
    label,
    navigationScope.district,
    navigationScope.region,
    navigationScope.subRegion,
    navigationScope.warehouseCode,
    navigationScope.salesNo,
    candidate.navigation
      ?.focusModel ||
      "",
    candidate.navigation
      ?.focusColor ||
      "",
  ]
    .map(normalizeKey)
    .join("::");

  if (!candidate.filter) {
    candidate.filter = {
      type: candidate.type,
      value:
        candidate.type === "promoter"
          ? (
              candidate.navigation?.scope?.salesNo ||
              candidate.label
            )
          : candidate.type === "store"
            ? (
                candidate.navigation?.scope?.warehouseCode ||
                candidate.label
              )
            : candidate.label,
    };
  }

  const existing =
    map.get(identity);

  if (!existing) {
    map.set(
      identity,
      {
        ...candidate,
        sellOutQty:
          numberValue(
            candidate.sellOutQty
          ),
        salesAmount:
          numberValue(
            candidate.salesAmount
          ),
        inventoryQty:
          candidate.inventoryQty ===
            null
            ? null
            : numberValue(
                candidate.inventoryQty
              ),
      }
    );

    return;
  }

  existing.sellOutQty +=
    numberValue(
      candidate.sellOutQty
    );

  existing.salesAmount +=
    numberValue(
      candidate.salesAmount
    );

  if (
    existing.inventoryQty !==
      null &&
    candidate.inventoryQty !==
      null
  ) {
    existing.inventoryQty +=
      numberValue(
        candidate.inventoryQty
      );
  }
}

function buildSearchCandidates({
  inventoryRows,
  sellOutRows,
}) {
  const candidates =
    new Map();

  const addAreaCandidates = (
    row,
    metrics
  ) => {
    const district =
      normalizeText(
        row?.district
      );

    if (district) {
      addSearchCandidate(
        candidates,
        {
          type:
            "district",
          label:
            district,
          secondary:
            "District",
          searchText:
            district,
          ...metrics,
          navigation: {
            level:
              "district",
            scope: {
              district,
              region: "",
              subRegion: "",
              warehouseCode: "",
              salesNo: "",
            },
          },
        }
      );
    }

    const region =
      normalizeText(
        row?.region
      );

    if (region) {
      addSearchCandidate(
        candidates,
        {
          type:
            "region",
          label:
            region,
          secondary:
            district
              ? `Region • ${district}`
              : "Region",
          searchText:
            `${region} ${district}`,
          ...metrics,
          navigation: {
            level:
              "region",
            scope: {
              district,
              region,
              subRegion: "",
              warehouseCode: "",
              salesNo: "",
            },
          },
        }
      );
    }

    const subRegion =
      normalizeText(
        row?.subRegion
      );

    if (subRegion) {
      addSearchCandidate(
        candidates,
        {
          type:
            "subRegion",
          label:
            subRegion,
          secondary:
            [
              "Sub-Region",
              district,
              region,
            ]
              .filter(Boolean)
              .join(" • "),
          searchText:
            `${subRegion} ${region} ${district}`,
          ...metrics,
          navigation: {
            level:
              "subRegion",
            scope: {
              district,
              region,
              subRegion,
              warehouseCode: "",
              salesNo: "",
            },
          },
        }
      );
    }

    const warehouseCode =
      normalizeText(
        row?.warehouseCode
      );

    const warehouse =
      normalizeText(
        row?.warehouse
      );

    if (
      warehouseCode ||
      warehouse
    ) {
      addSearchCandidate(
        candidates,
        {
          type:
            "store",
          label:
            warehouse ||
            warehouseCode,
          secondary:
            [
              warehouseCode,
              subRegion,
              region,
              district,
            ]
              .filter(Boolean)
              .join(" • "),
          searchText:
            `${warehouseCode} ${warehouse} ${subRegion} ${region} ${district}`,
          ...metrics,
          navigation: {
            level:
              "store",
            scope: {
              district,
              region,
              subRegion,
              warehouseCode,
              salesNo: "",
            },
          },
        }
      );
    }
  };

  for (
    const row of
    inventoryRows || []
  ) {
    const inventoryQty =
      numberValue(
        row.inventoryQty
      );

    const metrics = {
      inventoryQty,
      sellOutQty: 0,
      salesAmount: 0,
    };

    addAreaCandidates(
      row,
      metrics
    );

    const scope =
      navigationScopeFromRow(
        row
      );

    const level =
      deepestAreaLevel(
        row
      );

    const displayModel =
      getDisplayModel(
        row
      );

    const displayColor =
      getDisplayColor(
        row
      );

    const productCandidates = [
      {
        type: "model",
        label:
          displayModel,
        secondary:
          [
            "Model",
            row.warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${displayModel} ${row.materialCode || ""} ${row.materialName || ""} ${row.brand || ""} ${row.category || ""}`,
        focusModel:
          displayModel,
      },
      {
        type: "color",
        label:
          displayColor,
        secondary:
          [
            "Color",
            displayModel,
            row.warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${displayColor} ${displayModel} ${row.materialCode || ""} ${row.materialName || ""}`,
        focusModel:
          displayModel,
        focusColor:
          displayColor,
      },
      {
        type: "material",
        label:
          normalizeText(
            row.materialCode ||
            row.materialName
          ),
        secondary:
          [
            normalizeText(
              row.materialName
            ),
            row.warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${row.materialCode || ""} ${row.materialName || ""} ${displayModel} ${displayColor}`,
        focusModel:
          displayModel,
        focusColor:
          displayColor,
      },
      {
        type: "category",
        label:
          normalizeText(
            row.category
          ),
        secondary:
          "Category",
        searchText:
          `${row.category || ""} ${row.brand || ""} ${displayModel}`,
      },
      {
        type: "brand",
        label:
          normalizeText(
            row.brand
          ),
        secondary:
          "Brand",
        searchText:
          `${row.brand || ""} ${row.category || ""} ${displayModel}`,
      },
    ];

    for (
      const item of
      productCandidates
    ) {
      if (!item.label) {
        continue;
      }

      addSearchCandidate(
        candidates,
        {
          type:
            item.type,
          label:
            item.label,
          secondary:
            item.secondary,
          searchText:
            item.searchText,
          inventoryQty,
          sellOutQty: 0,
          salesAmount: 0,
          navigation: {
            level,
            scope,
            focusModel:
              item.focusModel ||
              "",
            focusColor:
              item.focusColor ||
              "",
          },
        }
      );
    }
  }

  for (
    const row of
    sellOutRows || []
  ) {
    const sellOutQty =
      numberValue(
        row.sellOutQty
      );

    const salesAmount =
      numberValue(
        row.salesAmount
      );

    const metrics = {
      inventoryQty: 0,
      sellOutQty,
      salesAmount,
    };

    addAreaCandidates(
      row,
      metrics
    );

    const district =
      normalizeText(
        row?.district
      );

    const region =
      normalizeText(
        row?.region
      );

    const subRegion =
      normalizeText(
        row?.subRegion
      );

    const warehouseCode =
      normalizeText(
        row?.warehouseCode
      );

    const salesNo =
      normalizeText(
        row?.salesNo
      );

    const sales =
      normalizeText(
        row?.sales
      );

    if (
      salesNo ||
      sales
    ) {
      addSearchCandidate(
        candidates,
        {
          type:
            "promoter",
          label:
            sales ||
            salesNo,
          secondary:
            [
              salesNo,
              row.role,
              warehouseCode,
            ]
              .filter(Boolean)
              .join(" • "),
          searchText:
            `${salesNo} ${sales} ${row.role || ""} ${warehouseCode} ${row.warehouse || ""}`,
          inventoryQty: null,
          sellOutQty,
          salesAmount,
          navigation: {
            level:
              "promoter",
            scope: {
              district,
              region,
              subRegion,
              warehouseCode,
              salesNo,
            },
          },
        }
      );
    }

    const scope =
      navigationScopeFromRow(
        row
      );

    const level =
      deepestAreaLevel(
        row
      );

    const displayModel =
      getDisplayModel(
        row
      );

    const displayColor =
      getDisplayColor(
        row
      );

    const productCandidates = [
      {
        type: "model",
        label:
          displayModel,
        secondary:
          [
            "Model",
            warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${displayModel} ${row.materialCode || ""} ${row.materialName || ""} ${row.brand || ""} ${row.category || ""}`,
        focusModel:
          displayModel,
      },
      {
        type: "color",
        label:
          displayColor,
        secondary:
          [
            "Color",
            displayModel,
            warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${displayColor} ${displayModel} ${row.materialCode || ""} ${row.materialName || ""}`,
        focusModel:
          displayModel,
        focusColor:
          displayColor,
      },
      {
        type: "material",
        label:
          normalizeText(
            row.materialCode ||
            row.materialName
          ),
        secondary:
          [
            normalizeText(
              row.materialName
            ),
            warehouseCode,
          ]
            .filter(Boolean)
            .join(" • "),
        searchText:
          `${row.materialCode || ""} ${row.materialName || ""} ${displayModel} ${displayColor}`,
        focusModel:
          displayModel,
        focusColor:
          displayColor,
      },
      {
        type: "category",
        label:
          normalizeText(
            row.category
          ),
        secondary:
          "Category",
        searchText:
          `${row.category || ""} ${row.brand || ""} ${displayModel}`,
      },
      {
        type: "brand",
        label:
          normalizeText(
            row.brand
          ),
        secondary:
          "Brand",
        searchText:
          `${row.brand || ""} ${row.category || ""} ${displayModel}`,
      },
    ];

    for (
      const item of
      productCandidates
    ) {
      if (!item.label) {
        continue;
      }

      addSearchCandidate(
        candidates,
        {
          type:
            item.type,
          label:
            item.label,
          secondary:
            item.secondary,
          searchText:
            item.searchText,
          inventoryQty: 0,
          sellOutQty,
          salesAmount,
          navigation: {
            level,
            scope,
            focusModel:
              item.focusModel ||
              "",
            focusColor:
              item.focusColor ||
              "",
          },
        }
      );
    }
  }

  return [
    ...candidates.values(),
  ];
}


function matchesSelectedSearchFilter(
  row,
  {
    filterType = "",
    filterValue = "",
  } = {}
) {
  const type =
    normalizeText(filterType);

  const value =
    normalizeSearchText(filterValue);

  if (!type || !value) {
    return true;
  }

  const equals = (candidate) =>
    normalizeSearchText(candidate) === value;

  const includes = (candidate) =>
    normalizeSearchText(candidate).includes(value);

  switch (type) {
    case "district":
      return equals(row?.district);

    case "region":
      return equals(row?.region);

    case "subRegion":
      return equals(row?.subRegion);

    case "store":
      return (
        equals(row?.warehouseCode) ||
        equals(row?.warehouse) ||
        includes(row?.warehouse)
      );

    case "promoter":
      return (
        equals(row?.salesNo) ||
        equals(row?.sales) ||
        includes(row?.sales)
      );

    case "model":
      return equals(
        getDisplayModel(row)
      );

    case "color":
      return equals(
        getDisplayColor(row)
      );

    case "material":
      return (
        equals(row?.materialCode) ||
        equals(row?.materialName) ||
        includes(row?.materialName)
      );

    case "category":
      return equals(row?.category);

    case "brand":
      return equals(row?.brand);

    default:
      return true;
  }
}

function applySelectedSearchFilter(
  rows,
  filter
) {
  return (rows || []).filter(
    (row) =>
      matchesSelectedSearchFilter(
        row,
        filter
      )
  );
}


function resolveDashboardDateFilters({
  salesDateEnabled = true,
  salesFromDate = "",
  salesToDate = "",
  activationDateEnabled = false,
  activationFromDate = "",
  activationToDate = "",
} = {}) {
  const today =
    todayLocal();

  const resolvedSalesEnabled =
    salesDateEnabled !== false;

  const resolvedActivationEnabled =
    activationDateEnabled === true;

  return {
    salesDateEnabled:
      resolvedSalesEnabled,
    salesFromDate:
      resolvedSalesEnabled
        ? (
            normalizeText(
              salesFromDate
            ) || today
          )
        : "",
    salesToDate:
      resolvedSalesEnabled
        ? (
            normalizeText(
              salesToDate
            ) ||
            normalizeText(
              salesFromDate
            ) ||
            today
          )
        : "",
    activationDateEnabled:
      resolvedActivationEnabled,
    activationFromDate:
      resolvedActivationEnabled
        ? normalizeText(
            activationFromDate
          )
        : "",
    activationToDate:
      resolvedActivationEnabled
        ? (
            normalizeText(
              activationToDate
            ) ||
            normalizeText(
              activationFromDate
            )
          )
        : "",
  };
}

export const dashboardService = {
  async getSummary({
    fromDate = "",
    toDate = "",
    salesDateEnabled = true,
    salesFromDate = "",
    salesToDate = "",
    activationDateEnabled = false,
    activationFromDate = "",
    activationToDate = "",
    level = "district",
    district = "",
    region = "",
    subRegion = "",
    warehouseCode = "",
    salesNo = "",
    filterType = "",
    filterValue = "",
    authorizedScope = null,
  } = {}) {
    const dateFilters =
      resolveDashboardDateFilters({
        salesDateEnabled,
        salesFromDate:
          salesFromDate ||
          fromDate,
        salesToDate:
          salesToDate ||
          toDate,
        activationDateEnabled,
        activationFromDate,
        activationToDate,
      });

    const resolvedFrom =
      dateFilters.salesFromDate;

    const resolvedTo =
      dateFilters.salesToDate;

    const resolvedLevel =
      AREA_LEVELS.includes(
        level
      )
        ? level
        : "district";

    const requestedScope = {
      level:
        resolvedLevel,
      district:
        normalizeText(
          district
        ),
      region:
        normalizeText(
          region
        ),
      subRegion:
        normalizeText(
          subRegion
        ),
      warehouseCode:
        normalizeText(
          warehouseCode
        ),
      salesNo:
        normalizeText(
          salesNo
        ),
    };

    const scope =
      getAuthorizedDashboardScope(
        authorizedScope,
        requestedScope
      );

    const effectiveLevel =
      scope.level ||
      resolvedLevel;

    const [
      inventoryRows,
      sellOutRows,
    ] =
      await Promise.all([
        kingdeeService
          .getAllInventoryDataForExport({
            fromDate:
              resolvedFrom,
            toDate:
              resolvedTo,
            activationFromDate:
              dateFilters.activationFromDate,
            activationToDate:
              dateFilters.activationToDate,
            warehouseCode:
              scope.warehouseCode || "",
            region:
              scope.region || "",
            district:
              scope.district || "",
            subRegion:
              scope.subRegion || "",
            salesNo:
              scope.salesNo || "",
          }),

        Promise.resolve(
          kingdeeService
            .getAllSellOutDataForExport({
              fromDate:
                resolvedFrom,
              toDate:
                resolvedTo,
              activationFromDate:
                dateFilters.activationFromDate,
              activationToDate:
                dateFilters.activationToDate,
              warehouseCode:
                scope.warehouseCode || "",
              region:
                scope.region || "",
              district:
                scope.district || "",
              subRegion:
                scope.subRegion || "",
              salesNo:
                scope.salesNo || "",
            })
        ),
      ]);

    const visibleInventoryRows =
      excludeHQInventoryRows(
        inventoryRows
      );

    const scopedInventoryRows =
      applySelectedSearchFilter(
        filterRowsByScope(
          visibleInventoryRows,
          scope
        ),
        {
          filterType,
          filterValue,
        }
      );

    const scopedSellOutRows =
      applySelectedSearchFilter(
        filterRowsByScope(
          sellOutRows,
          scope
        ),
        {
          filterType,
          filterValue,
        }
      );

    const areaRows =
      aggregateAreaRows({
        inventoryRows:
          scopedInventoryRows,
        sellOutRows:
          scopedSellOutRows,
        level:
          effectiveLevel,
      });

    const isPromoterView =
      effectiveLevel ===
      "promoter";

    const models =
      aggregateModels({
        inventoryRows:
          isPromoterView
            ? []
            : scopedInventoryRows,
        sellOutRows:
          scopedSellOutRows,
        includeInventory:
          !isPromoterView,
        hideZeroActivity:
          isPromoterView,
      });

    const inventoryQty =
      sumBy(
        scopedInventoryRows,
        "inventoryQty"
      );

    const sellOutQty =
      sumBy(
        scopedSellOutRows,
        "sellOutQty"
      );

    const salesAmount =
      sumBy(
        scopedSellOutRows,
        "salesAmount"
      );

    const selectedDays =
      dateFilters.salesDateEnabled
        ? getSelectedDays(
            resolvedFrom,
            resolvedTo
          )
        : 1;

    return {
      status: "ok",
      source:
        "kingdee+sqlite",
      report:
        "dashboard-summary",

      dateFilters: {
        sales: {
          enabled:
            dateFilters.salesDateEnabled,
          from:
            dateFilters.salesFromDate,
          to:
            dateFilters.salesToDate,
        },
        activation: {
          enabled:
            dateFilters.activationDateEnabled,
          from:
            dateFilters.activationFromDate,
          to:
            dateFilters.activationToDate,
        },
        selectedSalesDays:
          selectedDays,
      },

      dateRange: {
        from:
          resolvedFrom,
        to:
          resolvedTo,
        selectedDays,
      },

      authorization: {
        authenticated:
          scope.authenticated === true,
        accessControlled:
          scope.accessControlled === true,
        employeeNo:
          scope.employeeNo || "",
        role:
          scope.role || "",
        accessLevel:
          scope.accessLevel || "",
        organizationCode:
          scope.organizationCode || "110",
      },

      navigation: {
        currentLevel:
          effectiveLevel,
        nextLevel:
          getNextLevel(
            effectiveLevel
          ),
        scope,
        breadcrumbs:
          buildBreadcrumbs(
            scope
          ),
      },

      selectedFilter: {
        type:
          normalizeText(filterType),
        value:
          normalizeText(filterValue),
      },

      kpis: {
        inventoryQty,
        sellOutQty,
        salesAmount,
        averageDailySellOut:
          selectedDays > 0
            ? sellOutQty /
              selectedDays
            : 0,
      },

      areaRows,
      models,
    };
  },

  async search({
    query = "",
    fromDate = "",
    toDate = "",
    salesDateEnabled = true,
    salesFromDate = "",
    salesToDate = "",
    activationDateEnabled = false,
    activationFromDate = "",
    activationToDate = "",
    district = "",
    region = "",
    subRegion = "",
    warehouseCode = "",
    salesNo = "",
    limit = 25,
    authorizedScope = null,
  } = {}) {
    const resolvedQuery =
      normalizeText(
        query
      );

    if (
      resolvedQuery.length < 2
    ) {
      return {
        status: "ok",
        query:
          resolvedQuery,
        resultCount: 0,
        results: [],
      };
    }

    const dateFilters =
      resolveDashboardDateFilters({
        salesDateEnabled,
        salesFromDate:
          salesFromDate ||
          fromDate,
        salesToDate:
          salesToDate ||
          toDate,
        activationDateEnabled,
        activationFromDate,
        activationToDate,
      });

    const resolvedFrom =
      dateFilters.salesFromDate;

    const resolvedTo =
      dateFilters.salesToDate;

    const requestedScope = {
      level: "district",
      district:
        normalizeText(
          district
        ),
      region:
        normalizeText(
          region
        ),
      subRegion:
        normalizeText(
          subRegion
        ),
      warehouseCode:
        normalizeText(
          warehouseCode
        ),
      salesNo:
        normalizeText(
          salesNo
        ),
    };

    const scope =
      getAuthorizedDashboardScope(
        authorizedScope,
        requestedScope
      );

    const [
      inventoryRows,
      sellOutRows,
    ] =
      await Promise.all([
        kingdeeService
          .getAllInventoryDataForExport({
            fromDate:
              resolvedFrom,
            toDate:
              resolvedTo,
            activationFromDate:
              dateFilters.activationFromDate,
            activationToDate:
              dateFilters.activationToDate,
            warehouseCode:
              scope.warehouseCode || "",
            region:
              scope.region || "",
            district:
              scope.district || "",
            subRegion:
              scope.subRegion || "",
            salesNo:
              scope.salesNo || "",
          }),

        Promise.resolve(
          kingdeeService
            .getAllSellOutDataForExport({
              fromDate:
                resolvedFrom,
              toDate:
                resolvedTo,
              activationFromDate:
                dateFilters.activationFromDate,
              activationToDate:
                dateFilters.activationToDate,
              warehouseCode:
                scope.warehouseCode || "",
              region:
                scope.region || "",
              district:
                scope.district || "",
              subRegion:
                scope.subRegion || "",
              salesNo:
                scope.salesNo || "",
            })
        ),
      ]);

    const visibleInventoryRows =
      excludeHQInventoryRows(
        inventoryRows
      );

    const scopedInventoryRows =
      filterRowsByScope(
        visibleInventoryRows,
        scope
      );

    const scopedSellOutRows =
      filterRowsByScope(
        sellOutRows,
        scope
      );

    const candidates =
      buildSearchCandidates({
        inventoryRows:
          scopedInventoryRows,
        sellOutRows:
          scopedSellOutRows,
      });

    const parsedLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) || 25,
          1
        ),
        50
      );

    const results =
      candidates
        .map(
          (candidate) => {
            const score =
              Math.max(
                fuzzyScore(
                  resolvedQuery,
                  candidate.label
                ),
                fuzzyScore(
                  resolvedQuery,
                  candidate.searchText
                )
              );

            return {
              ...candidate,
              score,
            };
          }
        )
        .filter(
          (candidate) =>
            candidate.score >=
            38
        )
        .sort(
          (a, b) =>
            b.score -
              a.score ||
            b.sellOutQty -
              a.sellOutQty ||
            b.inventoryQty -
              a.inventoryQty ||
            String(
              a.label
            ).localeCompare(
              String(
                b.label
              )
            )
        )
        .slice(
          0,
          parsedLimit
        )
        .map(
          ({
            searchText,
            ...result
          }) =>
            result
        );

    return {
      status: "ok",
      report:
        "dashboard-search",
      query:
        resolvedQuery,
      scope,
      authorization: {
        authenticated:
          scope.authenticated === true,
        accessControlled:
          scope.accessControlled === true,
        employeeNo:
          scope.employeeNo || "",
        role:
          scope.role || "",
        accessLevel:
          scope.accessLevel || "",
        organizationCode:
          scope.organizationCode || "110",
      },
      resultCount:
        results.length,
      results,
    };
  },
};
