import { TFile } from 'obsidian';
import { extractTags } from './markdown';

export interface SearchState {
	query: string;
	filterTag: string | null;
	filterPinned: 'all' | 'pinned' | 'unpinned';
	filterColors: string[];
	filterFolder: string | null;
	filterOperators: Map<string, string>;
}

export interface SearchSuggestion {
	type: 'operator' | 'tag' | 'color' | 'typeValue' | 'folder';
	value: string;
	display: string;
}

export function parseSearchOperators(query: string): Omit<SearchState, 'query'> {
	const filterOperators = new Map<string, string>();
	const filterColors: string[] = [];
	let filterTag: string | null = null;
	let filterPinned: 'all' | 'pinned' | 'unpinned' = 'all';
	let filterFolder: string | null = null;

	// Parse operators: tag:name, color:red, is:pinned, type:empty, folder:path, etc.
	// Support both quoted values (folder:"My Folder") and unquoted with spaces (folder:My Folder)
	const operatorRegex = /(tag|color|is|type|folder|path):(?:"([^"]+)"|(.+?))(?=\s+(?:tag|color|is|type|folder|path):|$)/gi;
	let match;

	while ((match = operatorRegex.exec(query)) !== null) {
		const operator = match[1]?.toLowerCase();
		// Value is either quoted (group 2) or unquoted (group 3)
		const value = (match[2] || match[3])?.trim().toLowerCase();

		if (!operator || !value) continue;

		if (operator === 'tag') {
			filterTag = value;
		} else if (operator === 'color') {
			filterColors.push(value);
		} else if (operator === 'folder' || operator === 'path') {
			filterFolder = value;
		} else if (operator === 'is') {
			if (value === 'pinned') {
				filterPinned = 'pinned';
			} else if (value === 'unpinned') {
				filterPinned = 'unpinned';
			}
		} else if (operator === 'type') {
			filterOperators.set(operator, value);
		}
	}

	return { filterTag, filterPinned, filterColors, filterFolder, filterOperators };
}

export function getSearchSuggestions(query: string, allTags: string[], allFolders: string[] = []): SearchSuggestion[] {
	const suggestions: SearchSuggestion[] = [];
	const lastWord = query.split(' ').pop() || '';

	// Show initial view when query is empty
	if (query.trim().length === 0) {
		const operators = ['folder:', 'tag:', 'color:', 'type:', 'is:pinned', 'is:unpinned'];
		operators.forEach(op => {
			suggestions.push({ type: 'operator', value: op, display: op });
		});
		return suggestions;
	}

	// Show operator suggestions
	if (!lastWord.includes(':')) {
		const operators = ['folder:', 'tag:', 'color:', 'type:', 'is:pinned', 'is:unpinned'];
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
		const types = ['empty', 'image', 'pdf', 'link', 'list', 'code', 'table'];
		const typePrefix = lastWord.substring(5).toLowerCase();
		const matchingTypes = types.filter(t => t.startsWith(typePrefix));

		if (matchingTypes.length > 0) {
			matchingTypes.forEach(type => {
				suggestions.push({ type: 'typeValue', value: `type:${type}`, display: `type:${type}` });
			});
			return suggestions;
		}
	}

	// Show folder suggestions when typing folder: or path:
	if (lastWord.startsWith('folder:') || lastWord.startsWith('path:')) {
		const prefix = lastWord.startsWith('folder:') ? 'folder:' : 'path:';
		const folderPrefix = lastWord.substring(prefix.length).toLowerCase();
		const matchingFolders = allFolders.filter(folder => folder.toLowerCase().includes(folderPrefix));

		if (matchingFolders.length > 0) {
			matchingFolders.slice(0, 8).forEach(folder => {
				const displayFolder = folder === '/' ? '/' : folder;
				suggestions.push({ type: 'folder', value: `folder:${folder}`, display: `folder:${displayFolder}` });
			});
			return suggestions;
		}
	}

	return suggestions;
}

export function getCleanQuery(query: string): string {
	return query
		.replace(/(tag|color|is|type|folder|path):(?:"[^"]+"|.+?)(?=\s+(?:tag|color|is|type|folder|path):|$)/gi, '')
		.trim()
		.toLowerCase();
}

export function isSimpleTextSearch(query: string): boolean {
	const hasOperators = /(tag|color|is|type|folder|path):/i.test(query);
	return !hasOperators && query.trim().length > 0;
}

export function highlightSearchTerms(element: HTMLElement, searchTerm: string): void {
	if (!searchTerm || searchTerm.trim().length === 0) return;
	
	const term = searchTerm.trim();
	const walker = document.createTreeWalker(
		element,
		NodeFilter.SHOW_TEXT,
		null
	);
	
	const textNodes: Text[] = [];
	let node: Node | null;
	
	// Collect all text nodes
	while ((node = walker.nextNode())) {
		textNodes.push(node as Text);
	}
	
	// Process each text node
	textNodes.forEach(textNode => {
		const text = textNode.textContent || '';
		const lowerText = text.toLowerCase();
		const lowerTerm = term.toLowerCase();
		const index = lowerText.indexOf(lowerTerm);
		
		if (index !== -1) {
			const parent = textNode.parentNode;
			if (!parent) return;
			
			// Skip if already highlighted or in certain elements
			if (parent.nodeName === 'MARK' || parent.nodeName === 'CODE' || parent.nodeName === 'PRE') {
				return;
			}
			
			// Create highlighted version
			const before = text.substring(0, index);
			const match = text.substring(index, index + term.length);
			const after = text.substring(index + term.length);
			
			const fragment = document.createDocumentFragment();
			
			if (before) fragment.appendChild(document.createTextNode(before));
			
			const mark = document.createElement('mark');
			mark.className = 'search-highlight';
			mark.textContent = match;
			fragment.appendChild(mark);
			
			if (after) {
				// Recursively highlight remaining text
				const afterNode = document.createTextNode(after);
				fragment.appendChild(afterNode);
			}
			
			parent.replaceChild(fragment, textNode);
		}
	});
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

	// Apply folder filter
	if (searchState.filterFolder) {
		const folderPath = searchState.filterFolder === '/' ? '' : searchState.filterFolder;
		filtered = filtered.filter(f => {
			if (folderPath === '') return true; // All files if root
			return f.path.toLowerCase().startsWith(folderPath);
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
						// Match markdown images with image extensions
						// Supports: ![](image.jpg), ![[image.png]], and common image formats
						if (!content.match(/!\[.*?\]\([^)]*\.(png|jpg|jpeg|gif|bmp|svg|webp)[^)]*\)|!\[\[[^\]]*\.(png|jpg|jpeg|gif|bmp|svg|webp)[^\]]*\]\]/i)) return false;
						break;
					case 'pdf':
						// Match markdown embeds with PDF extensions
						// Supports: ![](document.pdf), ![[document.pdf]], [](document.pdf), [[document.pdf]]
						if (!content.match(/!?\[.*?\]\([^)]*\.pdf[^)]*\)|!?\[\[[^\]]*\.pdf[^\]]*\]\]/i)) return false;
						break;
					case 'link':
						// Match links to pages, excluding images and PDFs
						// Excludes: links with ! prefix (embeds) and links to image/PDF files
						const linkPattern = new RegExp(
							'(?<!!)\\[.*?\\]\\((?![^)]*\\.(png|jpg|jpeg|gif|bmp|svg|webp|pdf)\\b)[^)]+\\)|' +
							'(?<!!)\\[\\[(?![^\\]]*\\.(png|jpg|jpeg|gif|bmp|svg|webp|pdf)\\b)[^\\]]+\\]\\]',
							'i'
						);
						if (!content.match(linkPattern)) return false;
						break;
					case 'list':
						if (!content.match(/^\s*[-*+]\s|^\s*\d+\.\s/m)) return false;
						break;
					case 'code':
						if (!content.match(/```[\s\S]*?```|`[^`|]+`/)) return false;
						break;
					case 'table':
						if (!content.match(/\|[^\n]*\|\n\|[\s:|-]+\|/)) return false;
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
