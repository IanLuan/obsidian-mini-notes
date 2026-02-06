import { TFile } from 'obsidian';
import { extractTags } from './markdown';

export interface SearchState {
	query: string;
	filterTag: string | null;
	filterPinned: 'all' | 'pinned' | 'unpinned';
	filterColors: string[];
	filterOperators: Map<string, string>;
}

export interface SearchSuggestion {
	type: 'operator' | 'tag' | 'color' | 'typeValue';
	value: string;
	display: string;
}

export function parseSearchOperators(query: string): Omit<SearchState, 'query'> {
	const filterOperators = new Map<string, string>();
	const filterColors: string[] = [];
	let filterTag: string | null = null;
	let filterPinned: 'all' | 'pinned' | 'unpinned' = 'all';

	// Parse operators: tag:name, color:red, is:pinned, has:tags, type:empty, etc.
	const operatorRegex = /(tag|color|is|has|type):(\S+)/gi;
	let match;

	while ((match = operatorRegex.exec(query)) !== null) {
		const operator = match[1]?.toLowerCase();
		const value = match[2]?.toLowerCase();

		if (!operator || !value) continue;

		if (operator === 'tag') {
			filterTag = value;
		} else if (operator === 'color') {
			filterColors.push(value);
		} else if (operator === 'is') {
			if (value === 'pinned') {
				filterPinned = 'pinned';
			} else if (value === 'unpinned') {
				filterPinned = 'unpinned';
			}
		} else if (operator === 'has' || operator === 'type') {
			filterOperators.set(operator, value);
		}
	}

	return { filterTag, filterPinned, filterColors, filterOperators };
}

export function getSearchSuggestions(query: string, allTags: string[]): SearchSuggestion[] {
	const suggestions: SearchSuggestion[] = [];
	const lastWord = query.split(' ').pop() || '';

	// Show operator suggestions
	if (!lastWord.includes(':')) {
		const operators = ['tag:', 'color:', 'type:', 'is:pinned', 'is:unpinned', 'has:tags', 'has:content'];
		const matchingOps = operators.filter(op => op.startsWith(lastWord.toLowerCase()));

		if (matchingOps.length > 0 && lastWord.length > 0) {
			matchingOps.forEach(op => {
				suggestions.push({ type: 'operator', value: op, display: op });
			});
			return suggestions;
		}
	}

	// Show tag suggestions when typing tag:
	if (lastWord.startsWith('tag:')) {
		const tagPrefix = lastWord.substring(4).toLowerCase();
		const matchingTags = allTags.filter(tag => tag.toLowerCase().includes(tagPrefix));

		if (matchingTags.length > 0) {
			matchingTags.slice(0, 8).forEach(tag => {
				suggestions.push({ type: 'tag', value: `tag:${tag}`, display: `tag:${tag}` });
			});
			return suggestions;
		}
	}

	// Show color suggestions when typing color:
	if (lastWord.startsWith('color:')) {
		const colors = ['pink', 'peach', 'yellow', 'green', 'blue', 'purple', 'magenta', 'gray'];
		const colorPrefix = lastWord.substring(6).toLowerCase();
		const matchingColors = colors.filter(c => c.startsWith(colorPrefix));

		if (matchingColors.length > 0) {
			matchingColors.forEach(color => {
				suggestions.push({ type: 'color', value: `color:${color}`, display: `color:${color}` });
			});
			return suggestions;
		}
	}

	// Show type suggestions when typing type:
	if (lastWord.startsWith('type:')) {
		const types = ['empty', 'image', 'link', 'list', 'code', 'table'];
		const typePrefix = lastWord.substring(5).toLowerCase();
		const matchingTypes = types.filter(t => t.startsWith(typePrefix));

		if (matchingTypes.length > 0) {
			matchingTypes.forEach(type => {
				suggestions.push({ type: 'typeValue', value: `type:${type}`, display: `type:${type}` });
			});
			return suggestions;
		}
	}

	return suggestions;
}

export function getCleanQuery(query: string): string {
	return query
		.replace(/(tag|color|is|has|type):\S+/gi, '')
		.trim()
		.toLowerCase();
}

export function filterFiles(
	files: TFile[],
	fileContents: Map<string, string>,
	searchState: SearchState,
	isPinned: (path: string) => boolean,
	getNoteColor: (path: string) => string | undefined
): TFile[] {
	let filtered = [...files];

	// Apply pinned filter
	if (searchState.filterPinned === 'pinned') {
		filtered = filtered.filter(f => isPinned(f.path));
	} else if (searchState.filterPinned === 'unpinned') {
		filtered = filtered.filter(f => !isPinned(f.path));
	}

	// Apply tag filter
	if (searchState.filterTag) {
		filtered = filtered.filter(f => {
			const content = fileContents.get(f.path) || '';
			const tags = extractTags(content);
			return tags.includes(searchState.filterTag!);
		});
	}

	// Apply search filter with operators
	if (searchState.query) {
		const cleanQuery = getCleanQuery(searchState.query);

		filtered = filtered.filter(f => {
			const content = fileContents.get(f.path) || '';
			const tags = extractTags(content);

			// Check text search
			let matchesText = true;
			if (cleanQuery) {
				matchesText = f.basename.toLowerCase().includes(cleanQuery) ||
					content.toLowerCase().includes(cleanQuery);
			}

			// Check has: operators
			if (searchState.filterOperators.has('has')) {
				const hasValue = searchState.filterOperators.get('has');
				if (hasValue === 'tags' && tags.length === 0) return false;
				if (hasValue === 'content' && content.trim().length === 0) return false;
			}

			// Check type: operators
			if (searchState.filterOperators.has('type')) {
				const typeValue = searchState.filterOperators.get('type');
				const trimmedContent = content.trim();

				switch (typeValue) {
					case 'empty':
						if (trimmedContent.length > 0) return false;
						break;
					case 'image':
						if (!content.match(/!\[.*?\]\(.*?\)/)) return false;
						break;
					case 'link':
						if (!content.match(/\[.*?\]\(.*?\)|\[\[.*?\]\]/)) return false;
						break;
					case 'list':
						if (!content.match(/^\s*[-*+]\s|^\s*\d+\.\s/m)) return false;
						break;
					case 'code':
						if (!content.match(/```|`[^`]+`/)) return false;
						break;
					case 'table':
						if (!content.match(/\|.*\|/)) return false;
						break;
				}
			}

			// Check color filters
			if (searchState.filterColors.length > 0) {
				const savedColor = getNoteColor(f.path);
				if (!savedColor) return false;

				const colorMatch = searchState.filterColors.some(filterColor => {
					const colorMap: Record<string, string> = {
						'pink': 'pastel-pink',
						'peach': 'pastel-peach',
						'yellow': 'pastel-yellow',
						'green': 'pastel-green',
						'blue': 'pastel-blue',
						'purple': 'pastel-purple',
						'magenta': 'pastel-magenta',
						'gray': 'pastel-gray'
					};
					const expectedColor = colorMap[filterColor];
					if (!expectedColor) return false;
					return savedColor.includes(expectedColor);
				});

				if (!colorMatch) return false;
			}

			return matchesText;
		});
	}

	return filtered;
}
