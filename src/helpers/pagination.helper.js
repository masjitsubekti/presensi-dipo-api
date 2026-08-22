/**
 * Pagination Helper
 * Provides consistent pagination response format
 */

const DEFAULT_PAGE_SIZE = 10;

/**
 * Build paginated response object
 * @param {Array}  items      - Array of records for current page
 * @param {number} total      - Total count of all matching records
 * @param {number} pageNumber - Current page number (1-indexed)
 * @param {number} pageSize   - Number of items per page
 * @returns {Object}
 */
const paginate = (items, total, pageNumber, pageSize) => {
  const totalItems = parseInt(total || 0, 10);
  const limitPerPage = parseInt(pageSize || 10, 10);
  const currentPage = parseInt(pageNumber || 1, 10);

  let totalPage = Math.ceil(totalItems / Math.max(1, limitPerPage));
  if (totalPage < 1) totalPage = 1;

  let nextPage = currentPage + 1;
  if (nextPage > totalPage) nextPage = totalPage;

  let previousPage = currentPage - 1;
  if (previousPage < 1) previousPage = 1;

  return {
    items,
    meta: {
      totalItems,
      totalPage,
      previousPage,
      currentPage,
      nextPage,
      limitPerPage,
    },
  };
};

/**
 * Parse pagination params from query string
 * @param {Object} query - req.query object
 * @returns {{ pageNumber: number, pageSize: number, skip: number }}
 */
const parsePaginationParams = (query = {}) => {
  const pageNumber = Math.max(1, parseInt(query.pageNumber ?? query.page ?? 1, 10));
  const pageSize = Math.max(1, parseInt(query.pageSize ?? query.limit ?? DEFAULT_PAGE_SIZE, 10));
  const skip = (pageNumber - 1) * pageSize;

  return { pageNumber, pageSize, skip };
};

/**
 * Parse sort params from query string
 * @param {Object} query    - req.query object
 * @param {string} defaultSortBy - Default field to sort by
 * @param {Object} sortMap  - Map of allowed sort keys to DB column names
 * @returns {{ orderBy: Object }}
 */
const parseSortParams = (query = {}, defaultSortBy = 'createdAt', sortMap = {}) => {
  const rawSortBy = query.sortBy ?? defaultSortBy;
  const sortType = (query.sortType ?? 'desc').toLowerCase() === 'asc' ? 'asc' : 'desc';
  const sortField = sortMap[rawSortBy] ?? sortMap[defaultSortBy] ?? 'createdAt';

  return { sortField, sortType };
};

module.exports = {
  paginate,
  parsePaginationParams,
  parseSortParams,
  DEFAULT_PAGE_SIZE,
};
