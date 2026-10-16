import { Button, Dropdown, Label } from "@heroui/react";
import { ChevronDown, GraduationCap } from "lucide-react";

interface Props {
	courses: { id: string; title: string; href: string }[];
}

export default function CourseMenu({ courses }: Props) {
	return (
		<Dropdown>
			<Button variant="secondary">
				<GraduationCap size={20} aria-hidden="true" />
				課程
				<ChevronDown size={16} aria-hidden="true" />
			</Button>
			<Dropdown.Popover placement="bottom start" className="max-w-[calc(100vw-2rem)]">
				<Dropdown.Menu aria-label="課程" className="max-w-sm">
					{courses.map((course) => (
						<Dropdown.Item key={course.id} id={course.id} href={course.href} textValue={course.title}>
							<Label className="whitespace-normal">{course.title}</Label>
						</Dropdown.Item>
					))}
				</Dropdown.Menu>
			</Dropdown.Popover>
		</Dropdown>
	);
}
