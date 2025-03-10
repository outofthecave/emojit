import { EmojitClient, PageReaction, ReactRequest } from '@emogit/emojit-core'
import { EmojiButton } from '@joeattardi/emoji-button'
import CircularProgress from '@material-ui/core/CircularProgress'
import Grid from '@material-ui/core/Grid'
import { createStyles, Theme, WithStyles, withStyles } from '@material-ui/core/styles'
import Typography from '@material-ui/core/Typography'
import HistoryIcon from '@material-ui/icons/History'
import update from 'immutability-helper'
import React from 'react'
import { browser, Tabs } from 'webextension-polyfill-ts'
import { ErrorHandler } from '../error_handler'
import { setupUserSettings, ThemePreferenceType } from '../user'
import { progressSpinnerColor } from './constants'
import { EmojitTheme } from './EmojitTheme'

const MAX_NUM_EMOJIS = 5

const styles = (theme: Theme) => createStyles({
	header: {
		marginBottom: theme.spacing(1),
	},
	end: {
		display: 'flex',
		justifyContent: 'flex-end',
		alignItems: 'flex-end',
	},
	reactingLoader: {
		position: 'relative',
		top: '-2px',
		paddingRight: '2px',
	},
	historyButton: {
		backgroundColor: 'inherit',
		cursor: 'pointer',
		border: 'none',
		outline: 'none',
		fontSize: '2em',
		// Make the buttons line up.
		position: 'relative',
		top: '9px',
	},
	badgesButton: {
		backgroundColor: 'inherit',
		cursor: 'pointer',
		border: 'none',
		outline: 'none',
		fontSize: '1.5em',
	},
	optionsButton: {
		backgroundColor: 'inherit',
		cursor: 'pointer',
		border: 'none',
		outline: 'none',
		// Make sure it align with the right side.
		paddingRight: theme.spacing(0.5),
		fontSize: '1.5em',
	},
	gridDiv: {
		flexGrow: 1,
		// Make sure there is an even amount of spacing on the left and right.
		overflowX: 'hidden',
	},
	reactionGrid: {
		marginTop: theme.spacing(1.5),
		minHeight: '8em',
		fontSize: '1.2em',
		marginBottom: theme.spacing(0.5),
		paddingLeft: theme.spacing(1),
		paddingRight: theme.spacing(1),
	},
	reactionButton: {
		backgroundColor: 'inherit',
		fontSize: 'inherit',
		cursor: 'pointer',
		outline: 'none',
		borderRadius: '16px',
		borderColor: 'lightgrey',
		minWidth: 'max-content',
		padding: '4px',
		paddingRight: '6px',
		paddingLeft: '6px',
	},
	reactionButtonPicked: {
		backgroundColor: 'dodgerblue',
	},
	reactionCount: {
		fontSize: '1em',
		color: 'grey',
		paddingLeft: '0.5em',
	},
	reactionPickedCount: {
		color: 'floralwhite',
	},
	errorSection: {
		color: 'red',
		fontSize: '1.0em',
		wordBreak: 'break-word',
		paddingLeft: theme.spacing(1),
		paddingRight: theme.spacing(1),
	},
	center: {
		display: 'flex',
		justifyContent: 'center',
		alignItems: 'center',
	},
	emojiTrigger: {
		backgroundColor: 'inherit',
		cursor: 'pointer',
		outline: 'none',
		borderRadius: '16px',
		borderColor: 'lightgrey',
		padding: '4px',
		margin: '2px',
		fontSize: '2em',
	}
})

class Reactions extends React.Component<WithStyles<typeof styles>, {
	emojit?: EmojitClient,
	pageUrl?: string,
	userReactions?: string[],
	pageReactions?: PageReaction[],
	showReactingLoader: boolean,
	tab?: Tabs.Tab,
}> {
	private errorHandler: ErrorHandler | undefined
	private picker: EmojiButton | undefined

	constructor(props: any) {
		super(props)
		this.state = {
			emojit: undefined,
			pageUrl: undefined,
			userReactions: undefined,
			pageReactions: undefined,
			showReactingLoader: false,
			tab: undefined,
		}
	}

	async componentDidMount() {
		this.errorHandler = new ErrorHandler(document.getElementById('error-text'))

		const { emojit, themePreference } = await setupUserSettings(['emojit', 'themePreference'])
		browser.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
			const pageUrl = tabs[0].url
			this.setState({ pageUrl, emojit, tab: tabs[0] }, () => {
				this.loadReactions()
			})
		})
		this.setUpEmojiPicker(themePreference)
	}

	setUpEmojiPicker(themePreference: ThemePreferenceType): void {
		// Docs https://emoji-button.js.org/docs/api/
		const trigger = document.getElementById('emoji-trigger')

		this.picker = new EmojiButton(
			{
				// Hide so that you can see that picking one worked.
				autoHide: true,
				emojiSize: '1.5em',
				emojisPerRow: 6,
				initialCategory: 'recents',
				position: 'bottom',
				recentsCount: 20,
				rows: 4,
				theme: themePreference === 'device' ? 'auto' : themePreference,
			}
		)

		this.picker.on('emoji', selection => {
			this.addEmoji(selection.emoji)
		})

		this.picker!.on('hidden', () => {
			this.condensePopup()
		})

		trigger!.addEventListener('click', () => {
			this.expandPopup()
			this.picker!.togglePicker(trigger!)
		})
	}

	openBadges(): void {
		browser.tabs.create({ url: '/pages/home.html?page=badges' })
	}

	openHistory(): void {
		browser.tabs.create({ url: '/pages/home.html?page=history' })
	}

	openOptions(): void {
		browser.runtime.openOptionsPage()
	}

	condensePopup(): void {
		document.getElementById('main-popup')!.style.height = '280px'
	}

	expandPopup(): void {
		document.getElementById('main-popup')!.style.height = '500px'
	}

	async loadReactions(): Promise<void> {
		console.debug("Loading reactions...")

		try {
			const { userReactions, pageReactions } = await this.state.emojit!.getUserPageReactions(this.state.pageUrl!)
			this.setState({ userReactions, pageReactions }, () => {
				this.updateBadgeText()
			})
		} catch (serviceError) {
			this.errorHandler!.showError({ serviceError })
			this.setState({ userReactions: [], pageReactions: [] })
		}
	}

	hasMaxReactions(): boolean {
		return !this.state.userReactions || this.state.userReactions.length >= MAX_NUM_EMOJIS
	}

	addEmoji(reaction: string): void {
		if (this.hasMaxReactions() && this.picker) {
			if (this.picker.isPickerVisible()) {
				this.picker.hidePicker()
			}
			const errorMsg = "Maximum number of emojis selected."
			this.errorHandler!.showError({ errorMsg })
			return
		}

		// Update the UI before sending the request to the service to make the UI feel quick.
		this.updatePageReactions({ reaction, count: +1 })
		this.setState({
			userReactions: update(this.state.userReactions, { $push: [reaction] }),
			showReactingLoader: true,
		}, () => {
			this.react([{ reaction, count: +1 }]).catch((serviceError: any) => {
				this.errorHandler!.showError({ serviceError })
				// Remove the reaction.

				const index = this.state.userReactions!.indexOf(reaction)
				if (index > -1) {
					this.updatePageReactions({ reaction, count: -1 })
					this.setState({
						userReactions: update(this.state.userReactions, { $splice: [[index, 1]] }),
					})
				}
			}).finally(() => {
				this.setState({ showReactingLoader: false })
			})
		})
	}

	private updateBadgeText() {
		const topReaction = this.getTopReaction()
		if (topReaction && topReaction.count > 0) {
			browser.browserAction.setBadgeText({ tabId: this.state.tab!.id, text: topReaction.reaction })
		} else {
			browser.browserAction.setBadgeText({ tabId: this.state.tab!.id, text: null })
		}
	}

	react(modifications: PageReaction[]): any {
		const { pageUrl } = this.state
		if (!pageUrl) {
			console.warn("pageUrl has not been set yet. Will retry.")
			setTimeout(() => { this.react(modifications) }, 200)
			return
		}
		return this.state.emojit!.react(new ReactRequest(pageUrl, modifications))
			.then(r => {
				this.errorHandler!.clear()
				return r
			})
	}

	clickReaction(reaction: string): void {
		const isPickedByUser = this.state.userReactions !== undefined && this.state.userReactions.indexOf(reaction) > -1
		if (isPickedByUser) {
			this.removeAllEmojiOccurrences(reaction)
		} else {
			if (this.hasMaxReactions()) {
				const errorMsg = "Maximum number of emojis selected."
				this.errorHandler!.showError({ errorMsg })
				return
			}
			this.addEmoji(reaction)
		}
	}

	removeAllEmojiOccurrences(reaction: string): void {
		const indicesToRemove = []
		// eslint-disable-next-line no-constant-condition
		while (true) {
			const fromIndex = indicesToRemove.length === 0 ? 0 : indicesToRemove[indicesToRemove.length - 1] + 1
			const index = this.state.userReactions!.indexOf(reaction, fromIndex)
			if (index > -1) {
				indicesToRemove.push(index)
			} else {
				break
			}
		}
		if (indicesToRemove.length > 0) {
			const countDiff = -indicesToRemove.length
			this.updatePageReactions({ reaction, count: countDiff })
			this.setState({
				userReactions: update(this.state.userReactions, { $splice: indicesToRemove.reverse().map(i => [i, 1]) }),
				showReactingLoader: true,
			})

			this.react([{ reaction, count: countDiff }]).catch((serviceError: any) => {
				this.errorHandler!.showError({ serviceError })
				// Add back the reactions.
				this.updatePageReactions({ reaction, count: Math.abs(countDiff) })
				this.setState({
					userReactions: update(this.state.userReactions, { $push: Array(Math.abs(countDiff)).fill(reaction) }),
					showReactingLoader: true,
				})
			}).finally(() => {
				this.setState({ showReactingLoader: false })
			})
		}
	}

	updatePageReactions(modification: PageReaction): void {
		const pageReactions = this.state.pageReactions || []
		let found = false
		pageReactions.forEach(r => {
			if (r.reaction === modification.reaction) {
				found = true
				// Even keep 0 in case they want to redo the reaction.
				r.count += modification.count
			}
		})
		if (!found && modification.count > 0) {
			pageReactions.push(modification)
		}
		// Purposely do not re-sort to avoid jumpiness.

		this.setState({ pageReactions }, () => {
			this.updateBadgeText()
		})
	}

	getTopReaction(): PageReaction | undefined {
		const { pageReactions } = this.state
		if (!pageReactions || pageReactions.length === 0) {
			return undefined
		}
		return pageReactions.reduce((prev, current) => prev.count < current.count ? current : prev)
	}

	render(): React.ReactNode {
		const { classes } = this.props

		// `pageReactions` already include the user's reactions.

		return <div>
			<EmojitTheme>
				<div className={`${classes.header} ${classes.end}`}>
					{this.state.showReactingLoader && <CircularProgress className={classes.reactingLoader} size={20} thickness={5} style={{ color: progressSpinnerColor }} />}
					<button className={classes.historyButton}
						onClick={this.openHistory}>
						<HistoryIcon color="primary" fontSize="inherit" />
					</button>
					<button className={classes.badgesButton}
						onClick={this.openBadges}>
						🏆
					</button>
					<button
						className={classes.optionsButton}
						onClick={this.openOptions}>
						⚙️
					</button>
				</div>
				<div className={classes.gridDiv}>
					<Grid container
						className={classes.reactionGrid}
						direction="row"
						justify="center"
						alignItems="center"
						spacing={1}
					>
						{/* Keep spinner in here so that the emoji button doesn't jump too much. */}
						{this.state.pageReactions === undefined && <div>
							<CircularProgress size={60} style={{ color: progressSpinnerColor }} />
						</div>}
						{this.state.pageReactions !== undefined && this.state.pageReactions.map(pageReaction => {
							const isPicked = this.state.userReactions && this.state.userReactions.indexOf(pageReaction.reaction) > -1
							return <Grid key={`reaction-${pageReaction.reaction}`}
								container item xs
								justify="center">
								<button className={`${classes.reactionButton} ${isPicked ? classes.reactionButtonPicked : ''}`} onClick={() => this.clickReaction(pageReaction.reaction)}>
									<span>
										{pageReaction.reaction}
									</span>
									<span className={`${classes.reactionCount} ${isPicked ? classes.reactionPickedCount : ''}`}>
										{pageReaction.count}
									</span>
								</button>
							</Grid>
						}
						)}
					</Grid>
				</div>
				<div className={classes.errorSection}>
					<Typography component="p" id="error-text"></Typography>
				</div>
				<div className={classes.center}>
					<button
						id="emoji-trigger"
						className={classes.emojiTrigger}
						disabled={this.hasMaxReactions()}
					>
						🙂
					</button>
				</div>
			</EmojitTheme>
		</div>
	}
}

export default withStyles(styles)(Reactions)
