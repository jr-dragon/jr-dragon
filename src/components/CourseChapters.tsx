import { Chip } from "@heroui/react";

interface Translation {
	locale: string;
	language: string;
	title: string;
	href: string;
}

interface Props {
	chapters: {
		id: string;
		order: number;
		translations: Translation[];
	}[];
}

function languageLabel(translation: Translation) {
	if (translation.language === "zh-Hant") return "繁體中文";
	if (translation.language === "en") return "English";
	return translation.locale;
}

export default function CourseChapters({ chapters }: Props) {
	return (
		<ol className="divide-y divide-separator rounded-2xl bg-surface px-4">
			{chapters.map((chapter) => {
				const chinese = chapter.translations.find(({ language }) => language === "zh-Hant");
				const english = chapter.translations.find(({ language }) => language === "en");
				const primary = chinese ?? english ?? chapter.translations[0];
				const secondary = chinese && english ? english : undefined;
				const translations = [
					...(chinese ? [chinese] : []),
					...(english ? [english] : []),
					...chapter.translations.filter((translation) => translation !== chinese && translation !== english),
				];

				return (
					<li key={chapter.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-5">
						<div className="flex min-w-0 flex-1 basis-48 flex-col gap-1">
							<p className="text-xs text-muted">第 {chapter.order} 章</p>
							<a href={primary.href} hrefLang={primary.locale} className="space-y-1 rounded-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2">
								<h2 lang={primary.locale} className="break-words text-base font-medium">{primary.title}</h2>
								{secondary && <p lang={secondary.locale} className="break-words text-sm text-muted">{secondary.title}</p>}
							</a>
						</div>
						<div className="flex flex-wrap gap-2">
							{translations.map((translation) => (
								<a key={translation.locale} href={translation.href} hrefLang={translation.locale} aria-label={`${translation.title}（${languageLabel(translation)}）`} className="rounded-full transition-opacity hover:opacity-80 focus-visible:outline-2 focus-visible:outline-focus focus-visible:outline-offset-2">
									<Chip size="sm" variant="soft">
										<Chip.Label>{languageLabel(translation)}</Chip.Label>
									</Chip>
								</a>
							))}
						</div>
					</li>
				);
			})}
		</ol>
	);
}
