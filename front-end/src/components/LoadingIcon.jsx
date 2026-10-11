import styles from "./LoadingIcon.module.css"
import React from "react";

class LoadingIcon extends React.Component {

    constructor() {
        super();
        // "idle" until an Analyze/Apply Fixes click - nothing runs on its own.
        this.loadingState = "idle";
        window.loadingIcon = this;
    }

    setLoadingState(state) {
        this.loadingState = state
        this.forceUpdate()
    }

    render() {
        let image;
        if (this.loadingState === "loading")
            image = (<img className={styles.loading_icon} alt="loading" src="loadingIcon.gif" />);
        else if (this.loadingState === "success")
            image = (<img className={styles.loading_icon} alt="loading" src="./loadingFinishedIcon.svg" />);
        else if (this.loadingState === "error")
            image = (<img className={styles.loading_icon} alt="loading" src="./loadingFailedIcon.svg" />);
        else if (this.loadingState === "idle")
            image = (<span></span>)
        else {
            console.error("LoadingIcon.jsx: Invalid state value - " + this.loadingState)
            image = (<span></span>)
        }
        return (<span>{image}</span>)
    }
}



export default LoadingIcon;