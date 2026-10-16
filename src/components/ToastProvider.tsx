import { Toast } from "@heroui/react";

export default function ToastProvider() {
	return <Toast.Provider placement="bottom end" aria-label="通知" />;
}
