import clsx from 'clsx';

/**
 * A register, set like one. Ruled rows, no zebra stripes, and horizontal scroll contained
 * inside the table rather than pushing the page sideways on a phone.
 */
export function Table({ columns, rows, keyOf, empty, className }) {
  return (
    <div className={clsx('overflow-x-auto rounded-md border border-line bg-surface', className)}>
      <table className="w-full border-collapse text-left text-[14px]">
        <thead>
          <tr className="border-b border-line bg-wash/50">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                className={clsx(
                  'kicker whitespace-nowrap px-4 py-2.5 text-muted',
                  column.align === 'right' && 'text-right'
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-muted">
                {empty}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr
                key={keyOf(row)}
                className="border-b border-line transition-ui last:border-b-0 hover:bg-wash/40"
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    className={clsx(
                      'px-4 py-3 align-top',
                      column.align === 'right' && 'text-right',
                      column.nowrap && 'whitespace-nowrap'
                    )}
                    data-numeric={column.numeric || undefined}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
