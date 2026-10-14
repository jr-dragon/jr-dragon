import { Alert } from "@heroui/react";

interface Props {
	publishedAt: string;
	dateLabel: string;
}

export default function ArticleAgeAlert({ publishedAt, dateLabel }: Props) {
	return (
		<Alert role="note">
			<Alert.Indicator />
			<Alert.Content>
				<Alert.Title>
					本文章撰寫於 <time dateTime={publishedAt}>{dateLabel}</time>，其中內容可能已經過時或失效
				</Alert.Title>
			</Alert.Content>
		</Alert>
	);
}
