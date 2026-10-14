import { Chip } from "@heroui/react";

interface Props {
	tags: string[];
}

export default function ArticleTags({ tags }: Props) {
	return (
		<div className="flex flex-wrap justify-center gap-2">
			{tags.map((tag, index) => (
				<Chip key={`${tag}-${index}`}>
					<Chip.Label>{tag}</Chip.Label>
				</Chip>
			))}
		</div>
	);
}
