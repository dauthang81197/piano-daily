import { notFound } from 'next/navigation';

// Path chưa có trang (Search/Level... ở story sau) trả 404 bên trong layout của locale.
export default function CatchAll() {
  notFound();
}
