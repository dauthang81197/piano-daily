/**
 * Kích thước phím dùng chung cho cảnh 3D, tách riêng (thuần, không import gì) để mã nằm trong bundle ban đầu của player
 * (như `view-settings.ts`) dùng được mà không kéo cả `world.ts` của cảnh 3D theo.
 */
/** Một phím trắng rộng chừng này (mm): đơn vị của cảnh là "một phím trắng = 1". */
export const KEY_UNIT_MM = 23.5;
/** Độ dài phím trắng (đơn vị của cảnh): 150 mm. */
export const WHITE_LENGTH = 150 / KEY_UNIT_MM;
